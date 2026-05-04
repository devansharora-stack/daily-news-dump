import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { logger } from "../logger.js";

const limit = pLimit(3);

async function fetchGoogleNews(source) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(source.query + " when:1d")}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const items = [];
    $("item").each((_, el) => {
      const $el = $(el);
      const rawTitle = $el.find("title").text().trim();
      // Google News titles are formatted as "Headline - Source Name"
      const dashIdx = rawTitle.lastIndexOf(" - ");
      const title = dashIdx > 0 ? rawTitle.slice(0, dashIdx) : rawTitle;
      const originalSource = dashIdx > 0 ? rawTitle.slice(dashIdx + 3) : source.name;

      items.push({
        title,
        url: $el.find("link").text().trim(),
        source: originalSource,
        publishedAt: $el.find("pubDate").text().trim() || new Date().toISOString(),
        snippet: $el.find("description").text().replace(/<[^>]*>/g, "").trim().slice(0, 500),
        tier: 3,
      });
    });

    logger.info(`${source.name}: ${items.length} items`);
    return items.slice(0, 15);
  } catch (err) {
    logger.warn(`${source.name}: failed — ${err.message}`);
    return [];
  }
}

export async function fetchSearchSources(sources) {
  const results = [];

  const googleSources = sources.filter((s) => s.type === "google_news");
  const otherSources = sources.filter((s) => s.type !== "google_news");

  // Fetch all Google News queries in parallel with concurrency limit
  const googleResults = await Promise.allSettled(
    googleSources.map((source) => limit(() => fetchGoogleNews(source)))
  );
  for (const r of googleResults) {
    if (r.status === "fulfilled") results.push(...r.value);
  }

  // Handle other source types
  for (const source of otherSources) {
    if (source.type === "twitter") {
      logger.info(`${source.name}: skipped (requires X API credentials)`);
    }
  }

  return results;
}
