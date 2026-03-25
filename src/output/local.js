import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";
import { config } from "../config.js";
import { logger } from "../logger.js";

function buildDigestHtml(stories, dateStr) {
  const themes = [...new Set(stories.map((s) => s.theme))];

  const byTheme = {};
  for (const story of stories) {
    (byTheme[story.theme] ||= []).push(story);
  }

  const themeSections = Object.entries(byTheme)
    .map(
      ([theme, items]) => `
      <h2 style="color:#333;border-bottom:2px solid #eee;padding-bottom:8px;margin-top:32px;">${theme}</h2>
      ${items
        .map(
          (s) => `
        <div style="margin-bottom:20px;">
          <div style="font-size:16px;font-weight:600;">
            <a href="${s.url}" style="color:#111;text-decoration:none;">${s.headline}</a>
          </div>
          <div style="font-size:12px;color:#888;margin:4px 0;">${s.source}</div>
          <div style="font-size:14px;color:#444;line-height:1.6;">${s.summary}</div>
        </div>`
        )
        .join("")}
    `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Intelligence Digest — ${dateStr}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:32px 24px;">
    <div style="background:#111;color:#fff;padding:24px 32px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:22px;">AI Intelligence Digest</h1>
      <div style="color:#aaa;margin-top:4px;">${dateStr}</div>
    </div>
    <div style="background:#fff;padding:24px 32px;border-radius:0 0 8px 8px;">
      <p style="color:#666;font-size:14px;">
        <strong>${stories.length} stories</strong> across <strong>${themes.length} themes</strong>:
        ${themes.join(" &middot; ")}
      </p>
      ${themeSections}
    </div>
    <div style="text-align:center;color:#aaa;font-size:12px;margin-top:16px;">
      AI Content Intelligence Pipeline
    </div>
  </div>
</body>
</html>`;
}

export async function saveDigestLocally(stories, dateStr) {
  const outputDir = resolve(config.root, "digests");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const htmlPath = resolve(outputDir, `${dateStr}.html`);
  const jsonPath = resolve(outputDir, `${dateStr}.json`);
  const pdfPath = resolve(outputDir, `${dateStr}.pdf`);

  const html = buildDigestHtml(stories, dateStr);
  writeFileSync(htmlPath, html);
  writeFileSync(jsonPath, JSON.stringify(stories, null, 2));

  // Generate PDF
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    printBackground: true,
  });
  await browser.close();

  logger.info(`Digest saved: ${pdfPath}`);
  return { htmlPath, jsonPath, pdfPath };
}
