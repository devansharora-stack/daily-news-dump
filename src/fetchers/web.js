import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { logger } from "../logger.js";

const limit = pLimit(3);

async function fetchPage(url) {
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

function extractArticles(html, sourceName, sourceUrl) {
  const $ = cheerio.load(html);
  const articles = [];
  const seen = new Set();
  const baseUrl = new URL(sourceUrl).origin;

  // Generic extraction: look for article-like elements
  const selectors = [
    "article",
    '[class*="card"]',
    '[class*="post"]',
    '[class*="article"]',
    '[class*="story"]',
    '[class*="item"]',
    ".promo",
    "li",
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const $link = $el.find("a").first();
      let href = $link.attr("href") || "";
      const title =
        $el.find("h1, h2, h3, h4").first().text().trim() ||
        $link.text().trim();

      if (!title || title.length < 15 || title.length > 300) return;
      if (!href) return;

      // Resolve relative URLs
      if (href.startsWith("/")) href = baseUrl + href;
      if (!href.startsWith("http")) return;

      if (seen.has(href)) return;
      seen.add(href);

      const snippet = $el.find("p").first().text().trim().slice(0, 500);

      articles.push({
        title,
        url: href,
        source: sourceName,
        publishedAt: new Date().toISOString(),
        snippet,
        tier: 2,
      });
    });

    if (articles.length >= 15) break;
  }

  return articles.slice(0, 15);
}

export async function fetchWebSources(sources) {
  const results = await Promise.allSettled(
    sources.map((source) =>
      limit(async () => {
        try {
          const html = await fetchPage(source.url);
          const articles = extractArticles(html, source.name, source.url);
          logger.info(`${source.name}: ${articles.length} items`);
          return articles;
        } catch (err) {
          logger.warn(`${source.name}: failed — ${err.message}`);
          return [];
        }
      })
    )
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
