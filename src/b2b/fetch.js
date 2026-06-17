import { readFileSync, existsSync } from "node:fs";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { fetchRssSources } from "../fetchers/rss.js";
import { fetchWebSources } from "../fetchers/web.js";
import { fetchSearchSources } from "../fetchers/search.js";

function loadSentUrls() {
  if (!existsSync(config.b2bSentHistoryPath)) return new Set();
  const history = JSON.parse(readFileSync(config.b2bSentHistoryPath, "utf-8"));
  return new Set((history.sent || []).map((entry) => entry.url));
}

export async function fetchB2BSources() {
  const sources = JSON.parse(readFileSync(config.b2bSourcesPath, "utf-8"));

  logger.info("B2B: Starting source fetching...");

  const [rssItems, webItems, searchItems] = await Promise.all([
    fetchRssSources(sources.rss || []),
    fetchWebSources(sources.web || []),
    fetchSearchSources(sources.search || []),
  ]);

  const allItems = [...rssItems, ...webItems, ...searchItems];

  // Deduplicate by URL
  const seen = new Set();
  const deduped = allItems.filter((item) => {
    if (!item.url) return false;
    const key = item.url.includes("news.google.com/rss/articles")
      ? item.title
      : item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter out already-sent URLs
  const sentUrls = loadSentUrls();
  const fresh = deduped.filter((item) => !sentUrls.has(item.url));

  logger.info(
    `B2B: Fetched ${allItems.length} total, ${deduped.length} after dedup, ${fresh.length} after filtering sent history (${sentUrls.size} already sent)`
  );

  return { freshItems: fresh, sentUrls };
}
