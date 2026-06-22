import { logger } from "../logger.js";

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDigestCard(stories, dateStr) {
  const byTheme = {};
  for (const s of stories) {
    (byTheme[s.theme] ||= []).push(s);
  }
  const themes = Object.keys(byTheme);

  const sections = [];

  sections.push({
    widgets: [
      {
        decoratedText: {
          icon: { knownIcon: "DESCRIPTION" },
          text: `<b>${stories.length} curated stories</b>  |  ${themes.length} themes`,
        },
      },
      { decoratedText: { icon: { knownIcon: "CLOCK" }, text: dateStr } },
      { divider: {} },
      {
        textParagraph: {
          text: `<font color="#666666"><i>Themes: ${themes.join("  ·  ")}</i></font>`,
        },
      },
    ],
  });

  for (const theme of themes) {
    const widgets = [];
    byTheme[theme].forEach((story, i) => {
      if (i > 0) widgets.push({ divider: {} });
      widgets.push({
        decoratedText: {
          text: `<b><a href="${story.url}">${escapeHtml(story.headline)}</a></b>`,
          wrapText: true,
          bottomLabel: story.source,
        },
      });
      widgets.push({
        textParagraph: { text: `<font color="#555555">${escapeHtml(story.summary)}</font>` },
      });
      widgets.push({
        buttonList: {
          buttons: [{ text: "Read article", onClick: { openLink: { url: story.url } } }],
        },
      });
    });

    sections.push({
      header: `${theme}  (${byTheme[theme].length})`,
      collapsible: true,
      uncollapsibleWidgetsCount: 3,
      widgets,
    });
  }

  sections.push({
    widgets: [
      { divider: {} },
      {
        textParagraph: {
          text: '<font color="#999999">AI Intelligence Digest  ·  Automated daily via GitHub Actions + Claude</font>',
        },
      },
    ],
  });

  return {
    cardsV2: [
      {
        cardId: `digest-${dateStr}`,
        card: {
          header: {
            title: "AI Intelligence Digest",
            subtitle: `${dateStr}  ·  ${stories.length} stories across ${themes.length} themes`,
            imageUrl: "https://www.gstatic.com/images/branding/product/2x/google_news_64dp.png",
            imageType: "CIRCLE",
          },
          sections,
        },
      },
    ],
  };
}

export async function sendToChat(card, label = "digest") {
  const webhook = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!webhook) {
    logger.info(`Chat delivery skipped — GOOGLE_CHAT_WEBHOOK_URL not set (${label})`);
    return;
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chat webhook returned HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  logger.info(`Posted ${label} to Google Chat (HTTP ${res.status})`);
}

export async function sendDigestToChat(stories, dateStr) {
  if (!stories || stories.length === 0) return;
  await sendToChat(buildDigestCard(stories, dateStr), "AI digest");
}
