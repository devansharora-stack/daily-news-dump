import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { fetchRssSources } from "./rss.js";
import { fetchWebSources } from "./web.js";
import { fetchSearchSources } from "./search.js";

export async function fetchAllSources() {
  const sourcesPath = resolve(config.root, "config/sources.json");
  const sources = JSON.parse(readFileSync(sourcesPath, "utf-8"));

  logger.info("Starting source fetching...");

  const [rssItems, webItems, searchItems] = await Promise.all([
    fetchRssSources(sources.rss || []),
    fetchWebSources(sources.web || []),
    fetchSearchSources(sources.search || []),
  ]);

  const allItems = [...rssItems, ...webItems, ...searchItems];

  // Deduplicate by URL
  const seen = new Set();
  const deduped = allItems.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  logger.info(
    `Fetched ${allItems.length} total items, ${deduped.length} after dedup (RSS: ${rssItems.length}, Web: ${webItems.length}, Search: ${searchItems.length})`
  );

  // Cap at maxRawItems, preferring higher-tier sources
  const sorted = deduped.sort((a, b) => a.tier - b.tier);
  return sorted.slice(0, config.maxRawItems);
}
