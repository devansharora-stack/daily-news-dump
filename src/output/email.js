import { google } from "googleapis";
import { config } from "../config.js";
import { logger } from "../logger.js";

function buildEmailHtml(stories, dateStr, docUrl) {
  const themes = [...new Set(stories.map((s) => s.theme))];

  // Pick top 3 stories (first from each of the top 3 themes by count)
  const themeCounts = {};
  for (const s of stories) themeCounts[s.theme] = (themeCounts[s.theme] || 0) + 1;
  const topThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme]) => theme);
  const topStories = [];
  for (const theme of topThemes) {
    const story = stories.find((s) => s.theme === theme);
    if (story) topStories.push(story);
  }

  const topStoriesHtml = topStories
    .map(
      (s) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <a href="${s.url}" style="color:#111;font-weight:600;font-size:15px;text-decoration:none;">${s.headline}</a>
          <div style="color:#888;font-size:12px;margin:4px 0;">${s.source} &middot; ${s.theme}</div>
          <div style="color:#444;font-size:14px;line-height:1.5;">${s.summary}</div>
        </td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#111;color:#fff;padding:24px 32px;">
            <div style="font-size:20px;font-weight:700;">AI Intelligence Digest</div>
            <div style="font-size:14px;color:#aaa;margin-top:4px;">${dateStr}</div>
          </td>
        </tr>
        <!-- Summary -->
        <tr>
          <td style="padding:24px 32px 16px;">
            <div style="font-size:14px;color:#666;">
              <strong>${stories.length} stories</strong> curated across <strong>${themes.length} themes</strong>
            </div>
            <div style="font-size:13px;color:#999;margin-top:8px;">
              ${themes.join(" &middot; ")}
            </div>
          </td>
        </tr>
        <!-- Top Stories -->
        <tr>
          <td style="padding:0 32px;">
            <div style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Top Stories</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${topStoriesHtml}
            </table>
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td style="padding:24px 32px;">
            <a href="${docUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
              View Full Digest in Google Docs
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#aaa;">
            AI Content Intelligence Pipeline &middot; Automated daily digest
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildRawEmail(to, subject, htmlBody) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    htmlBody,
  ];
  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

export async function sendDigestEmail(stories, dateStr, docUrl, authClient) {
  if (!config.emailTo) {
    throw new Error("EMAIL_TO is required in .env");
  }

  const gmail = google.gmail({ version: "v1", auth: authClient });

  const subject = `AI Intelligence Digest — ${dateStr} (${stories.length} stories)`;
  const html = buildEmailHtml(stories, dateStr, docUrl);
  const raw = buildRawEmail(config.emailTo, subject, html);

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  logger.info(`Email sent to ${config.emailTo}`);
}
