import { google } from "googleapis";
import { authenticate } from "@google-cloud/local-auth";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "../config.js";
import { logger } from "../logger.js";

const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
];

async function getAuthClient() {
  // Reuse saved token if available
  if (existsSync(config.googleTokenPath)) {
    const credentials = JSON.parse(readFileSync(config.googleTokenPath, "utf-8"));
    const auth = google.auth.fromJSON({
      ...JSON.parse(readFileSync(config.googleCredentialsPath, "utf-8")).installed,
      ...credentials,
      type: "authorized_user",
    });
    return auth;
  }

  // First-time: interactive OAuth
  const auth = await authenticate({
    keyfilePath: config.googleCredentialsPath,
    scopes: SCOPES,
  });

  // Save token for reuse
  writeFileSync(config.googleTokenPath, JSON.stringify(auth.credentials));
  return auth;
}

function buildDocRequests(stories, dateStr) {
  const requests = [];
  let idx = 1; // Document index starts at 1

  // Title
  const title = `AI Intelligence Digest — ${dateStr}`;
  requests.push({ insertText: { location: { index: idx }, text: title + "\n" } });
  const titleEnd = idx + title.length;
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: idx, endIndex: titleEnd },
      paragraphStyle: { namedStyleType: "HEADING_1" },
      fields: "namedStyleType",
    },
  });
  idx = titleEnd + 1;

  // Subtitle
  const themes = [...new Set(stories.map((s) => s.theme))];
  const subtitle = `${stories.length} stories across ${themes.length} themes: ${themes.join(" · ")}`;
  requests.push({ insertText: { location: { index: idx }, text: subtitle + "\n\n" } });
  const subtitleEnd = idx + subtitle.length;
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: idx, endIndex: subtitleEnd },
      paragraphStyle: { namedStyleType: "SUBTITLE" },
      fields: "namedStyleType",
    },
  });
  idx = subtitleEnd + 2;

  // Group by theme
  const byTheme = {};
  for (const story of stories) {
    (byTheme[story.theme] ||= []).push(story);
  }

  for (const [theme, themeStories] of Object.entries(byTheme)) {
    // Theme header
    requests.push({ insertText: { location: { index: idx }, text: theme + "\n" } });
    const themeEnd = idx + theme.length;
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: idx, endIndex: themeEnd },
        paragraphStyle: { namedStyleType: "HEADING_2" },
        fields: "namedStyleType",
      },
    });
    idx = themeEnd + 1;

    for (const story of themeStories) {
      // Headline (bold)
      const headline = story.headline + "\n";
      requests.push({ insertText: { location: { index: idx }, text: headline } });
      requests.push({
        updateTextStyle: {
          range: { startIndex: idx, endIndex: idx + headline.length - 1 },
          textStyle: { bold: true },
          fields: "bold",
        },
      });
      idx += headline.length;

      // Source + link
      const sourceText = `${story.source}`;
      const sourceLine = sourceText + "\n";
      requests.push({ insertText: { location: { index: idx }, text: sourceLine } });
      if (story.url) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: idx, endIndex: idx + sourceText.length },
            textStyle: { link: { url: story.url } },
            fields: "link",
          },
        });
      }
      idx += sourceLine.length;

      // Summary
      const summaryLine = story.summary + "\n\n";
      requests.push({ insertText: { location: { index: idx }, text: summaryLine } });
      idx += summaryLine.length;
    }
  }

  return requests;
}

export async function createDigestDoc(stories, dateStr) {
  if (!existsSync(config.googleCredentialsPath)) {
    throw new Error(
      `Google credentials not found at ${config.googleCredentialsPath}. See .env.example for setup instructions.`
    );
  }

  const auth = await getAuthClient();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const title = `AI Intelligence Digest — ${dateStr}`;

  // Create empty doc
  const doc = await docs.documents.create({ requestBody: { title } });
  const docId = doc.data.documentId;
  logger.info(`Created Google Doc: ${docId}`);

  // Insert content
  const requests = buildDocRequests(stories, dateStr);
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests },
  });

  // Move to shared folder
  if (config.googleDriveFolderId) {
    await drive.files.update({
      fileId: docId,
      addParents: config.googleDriveFolderId,
      fields: "id, parents",
    });
  }

  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
  logger.info(`Doc published: ${docUrl}`);

  return { docId, docUrl, auth };
}
