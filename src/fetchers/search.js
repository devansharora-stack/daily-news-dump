import * as cheerio from "cheerio";
import { logger } from "../logger.js";

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:1d")}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const items = [];
    $("item").each((_, el) => {
      const $el = $(el);
      items.push({
        title: $el.find("title").text().trim(),
        url: $el.find("link").text().trim(),
        source: "Google News",
        publishedAt: $el.find("pubDate").text().trim() || new Date().toISOString(),
        snippet: $el.find("description").text().replace(/<[^>]*>/g, "").trim().slice(0, 500),
        tier: 3,
      });
    });

    logger.info(`Google News: ${items.length} items`);
    return items.slice(0, 20);
  } catch (err) {
    logger.warn(`Google News: failed — ${err.message}`);
    return [];
  }
}

export async function fetchSearchSources(sources) {
  const results = [];

  for (const source of sources) {
    if (source.type === "google_news") {
      const items = await fetchGoogleNews(source.query);
      results.push(...items);
    } else if (source.type === "twitter") {
      // Twitter/X requires API access — log and skip gracefully
      logger.info(`${source.name}: skipped (requires X API credentials)`);
    }
  }

  return results;
}
