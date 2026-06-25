import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { logger } from "../logger.js";

const limit = pLimit(3);

const DEAD_STATUS = new Set([404, 410, 451]);

async function fetchArticleText(url) {
  // Return the response (don't throw on HTTP status) so the caller can tell a
  // hard 404 (dead) apart from a 403 bot-block (real page) — only fetch() itself
  // rejecting indicates a network/DNS failure.
  return await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20000),
  });
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
          const res = await fetchArticleText(item.url);
          // Only a hard 404/410/451 means the page doesn't exist. 403/429/5xx are
          // bot-blocks or transient on a real page — keep them (they open in a browser).
          const urlDead = DEAD_STATUS.has(res.status);

          let fullText = null;
          let wordCount = 0;
          if (res.ok) {
            fullText = extractArticleBody(await res.text());
            wordCount = fullText ? fullText.split(/\s+/).length : 0;
          }

          if (urlDead) {
            logger.info(`  ${item.source}: HTTP ${res.status} — marking URL dead`);
          } else if (wordCount > 100) {
            logger.info(`  ${item.source}: enriched (${wordCount} words)`);
          } else {
            logger.info(`  ${item.source}: HTTP ${res.status}, using snippet`);
          }

          return { ...item, fullText: wordCount > 100 ? fullText : null, wordCount, urlDead };
        } catch (err) {
          // fetch() rejected: timeout/abort → keep (slow but likely real);
          // DNS/connection failure → the host is unreachable, mark dead.
          const urlDead = !(err.name === "TimeoutError" || err.name === "AbortError");
          logger.info(`  ${item.source}: fetch failed (${err.message})${urlDead ? " — marking URL dead" : ", using snippet"}`);
          return { ...item, fullText: null, wordCount: 0, urlDead };
        }
      })
    )
  );

  return results.map((r) => (r.status === "fulfilled" ? r.value : r.reason));
}
