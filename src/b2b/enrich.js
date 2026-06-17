import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { logger } from "../logger.js";

const limit = pLimit(3);

async function fetchArticleText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractArticleBody(html) {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("nav, header, footer, script, style, aside, [class*='sidebar'], [class*='nav'], [class*='menu'], [class*='comment'], [class*='related'], [class*='share'], [class*='social']").remove();

  // Try specific article selectors first
  const selectors = [
    "article",
    '[class*="post-content"]',
    '[class*="article-body"]',
    '[class*="entry-content"]',
    '[class*="post-body"]',
    '[class*="content-body"]',
    "main",
    '[role="main"]',
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > 500) return text;
    }
  }

  // Fallback: collect all paragraphs
  const paragraphs = [];
  $("p").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 40) paragraphs.push(text);
  });

  return paragraphs.join(" ").trim();
}

export async function enrichArticles(items) {
  logger.info(`B2B: Enriching ${items.length} articles with full text...`);

  const results = await Promise.allSettled(
    items.map((item) =>
      limit(async () => {
        try {
          const html = await fetchArticleText(item.url);
          const fullText = extractArticleBody(html);
          const wordCount = fullText ? fullText.split(/\s+/).length : 0;

          if (wordCount > 100) {
            logger.info(`  ${item.source}: enriched (${wordCount} words)`);
          } else {
            logger.info(`  ${item.source}: insufficient text, using snippet`);
          }

          return { ...item, fullText: wordCount > 100 ? fullText : null, wordCount };
        } catch (err) {
          logger.info(`  ${item.source}: fetch failed (${err.message}), using snippet`);
          return { ...item, fullText: null, wordCount: 0 };
        }
      })
    )
  );

  return results.map((r) => (r.status === "fulfilled" ? r.value : r.reason));
}
