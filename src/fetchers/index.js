import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { fetchRssSources } from "./rss.js";
import { fetchWebSources } from "./web.js";
import { fetchPlaywrightSources } from "./web-playwright.js";
import { fetchSearchSources } from "./search.js";

export async function fetchAllSources() {
  const sourcesPath = resolve(config.root, "config/sources.json");
  const sources = JSON.parse(readFileSync(sourcesPath, "utf-8"));

  logger.info("Starting source fetching...");

  // Run RSS, basic web, and search in parallel; Playwright separately (heavier)
  const [rssItems, webItems, searchItems] = await Promise.all([
    fetchRssSources(sources.rss || []),
    fetchWebSources(sources.web || []),
    fetchSearchSources(sources.search || []),
  ]);

  // Playwright sources run after to avoid resource contention
  const playwrightItems = await fetchPlaywrightSources(sources.web_playwright || []);

  const allItems = [...rssItems, ...webItems, ...playwrightItems, ...searchItems];

  // Deduplicate by normalized URL
  const seen = new Set();
  const deduped = allItems.filter((item) => {
    if (!item.url) return false;
    // Normalize Google News redirect URLs — extract the real source from title
    const key = item.url.includes("news.google.com/rss/articles")
      ? item.title
      : item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(
    `Fetched ${allItems.length} total items, ${deduped.length} after dedup (RSS: ${rssItems.length}, Web: ${webItems.length}, Playwright: ${playwrightItems.length}, Search: ${searchItems.length})`
  );

  // Cap at maxRawItems, preferring higher-tier sources
  const sorted = deduped.sort((a, b) => a.tier - b.tier);
  return sorted.slice(0, config.maxRawItems);
}
