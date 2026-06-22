import { logger } from "../logger.js";

function esc(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRecap(recap) {
  if (!recap) return "";
  if (typeof recap === "object" && recap.intro) {
    let html = esc(recap.intro) + "<br><br>";
    if (Array.isArray(recap.bullets)) {
      for (const b of recap.bullets) html += "▸ " + esc(b) + "<br><br>";
    }
    if (recap.closing) html += "<b>" + esc(recap.closing) + "</b>";
    return html;
  }
  if (Array.isArray(recap)) return recap.map((b) => "▸ " + esc(b)).join("<br><br>");
  return esc(String(recap));
}

const SCHOOL_ICON = "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/school/default/48px.svg";

function readButton(url) {
  return {
    buttonList: { buttons: [{ text: "Read the case study", onClick: { openLink: { url } } }] },
  };
}

function keyNotesHtml(notes) {
  return (notes || []).map((n) => "• " + esc(n) + "<br><br>").join("");
}

function buildResourceCard(d) {
  return {
    cardsV2: [{
      cardId: "b2b-resource-" + d.date,
      card: {
        header: {
          title: "📚 B2B Learning: " + esc(d.topic),
          subtitle: d.date + "  ·  " + d.dayLabel,
          imageUrl: SCHOOL_ICON,
          imageType: "CIRCLE",
        },
        sections: [
          { widgets: [{ textParagraph: { text: `<b><a href="${d.url}">${esc(d.headline)}</a></b><br><font color="#666666">${esc(d.source)}</font>` } }] },
          { widgets: [readButton(d.url)] },
          { widgets: [{ divider: {} }] },
          { header: "Key Notes", widgets: [{ textParagraph: { text: keyNotesHtml(d.keyNotes) } }] },
          { header: "🤔 Think About This", widgets: [{ textParagraph: { text: "<i>" + esc(d.question) + "</i>" } }] },
          { widgets: [{ divider: {} }, readButton(d.url)] },
          { widgets: [{ textParagraph: { text: '<font color="#999999">B2B Marketing Sprint  ·  Weekly learning via GitHub Actions + Gemini</font>' } }] },
        ],
      },
    }],
  };
}

function buildThursdayCard(d) {
  const recapLinks = (d.recapResources || [])
    .map((r) => `• <a href="${r.url}">${esc(r.headline)}</a> (${esc(r.source)})<br>`)
    .join("");

  return {
    cardsV2: [
      {
        cardId: "b2b-recap-" + d.date,
        card: {
          header: {
            title: "📋 Mid-Week Recap: " + esc(d.recapTopic),
            subtitle: d.date + "  ·  What we learned Mon–Wed",
            imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/checklist/default/48px.svg",
            imageType: "CIRCLE",
          },
          sections: [
            { header: "Recap", widgets: [{ textParagraph: { text: formatRecap(d.recap) } }] },
            { header: "Articles Covered", widgets: [{ textParagraph: { text: recapLinks } }] },
            { widgets: [{ textParagraph: { text: '<font color="#999999">B2B Marketing Sprint  ·  Topic A complete ✓</font>' } }] },
          ],
        },
      },
      {
        cardId: "b2b-intro-" + d.date,
        card: {
          header: {
            title: "🔜 Up Next: " + esc(d.topic),
            subtitle: d.dayLabel,
            imageUrl: SCHOOL_ICON,
            imageType: "CIRCLE",
          },
          sections: [
            { widgets: [{ textParagraph: { text: `<b><a href="${d.url}">${esc(d.headline)}</a></b><br><font color="#666666">${esc(d.source)}</font>` } }] },
            { widgets: [readButton(d.url)] },
            { widgets: [{ divider: {} }] },
            { header: "Key Notes", widgets: [{ textParagraph: { text: keyNotesHtml(d.keyNotes) } }] },
            { header: "🤔 Think About This", widgets: [{ textParagraph: { text: "<i>" + esc(d.question) + "</i>" } }] },
            { widgets: [{ divider: {} }, readButton(d.url)] },
            { widgets: [{ textParagraph: { text: '<font color="#999999">B2B Marketing Sprint  ·  Topic B begins</font>' } }] },
          ],
        },
      },
    ],
  };
}

function buildWeekRecapCard(d) {
  const resources = (d.resources || [])
    .map((r) => `• <a href="${r.url}">${esc(r.headline)}</a><br><font color="#666666">  ${esc(r.source)} · ${esc(r.topic)}</font><br><br>`)
    .join("");

  return {
    cardsV2: [{
      cardId: "b2b-week-recap-" + d.date,
      card: {
        header: {
          title: "🎓 This Week in B2B Learning",
          subtitle: d.date + "  ·  Week Recap",
          imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/emoji_events/default/48px.svg",
          imageType: "CIRCLE",
        },
        sections: [
          { header: "What You Learned", widgets: [{ textParagraph: { text: formatRecap(d.recap) } }] },
          { header: "All Resources This Week", widgets: [{ textParagraph: { text: resources } }] },
          { widgets: [{ divider: {} }, { textParagraph: { text: '<font color="#999999">B2B Marketing Sprint  ·  See you next week! 🚀</font>' } }] },
        ],
      },
    }],
  };
}

function buildCard(digest) {
  switch (digest.type) {
    case "resource":
      return buildResourceCard(digest);
    case "recap-and-resource":
      return buildThursdayCard(digest);
    case "recap-week":
      return buildWeekRecapCard(digest);
    default:
      return null;
  }
}

export async function sendB2BDigestToChat(digest) {
  const webhook = process.env.B2B_GOOGLE_CHAT_WEBHOOK_URL;
  if (!webhook) {
    logger.info("B2B Chat delivery skipped — B2B_GOOGLE_CHAT_WEBHOOK_URL not set");
    return;
  }
  if (!digest || !digest.type) return;

  const card = buildCard(digest);
  if (!card) {
    logger.warn(`B2B Chat: unknown digest type "${digest.type}", not sending`);
    return;
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`B2B Chat webhook returned HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  logger.info(`B2B: Posted ${digest.type} to Google Chat (HTTP ${res.status})`);
}
