import Parser from "rss-parser";
import pLimit from "p-limit";
import { logger } from "../logger.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "DailyUpdates/1.0 (AI Content Intelligence Pipeline)",
  },
  requestOptions: {
    redirect: "follow",
  },
});

const limit = pLimit(5);

export async function fetchRssSources(sources) {
  const results = await Promise.allSettled(
    sources.map((source) =>
      limit(async () => {
        try {
          const feed = await parser.parseURL(source.url);
          const now = Date.now();
          const oneDayAgo = now - 48 * 60 * 60 * 1000; // 48h window

          const items = (feed.items || [])
            .filter((item) => {
              const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : now;
              return pubDate >= oneDayAgo;
            })
            .map((item) => ({
              title: item.title?.trim() || "Untitled",
              url: item.link || item.guid || "",
              source: source.name,
              publishedAt: item.pubDate || new Date().toISOString(),
              snippet:
                item.contentSnippet?.slice(0, 500) ||
                item.content?.replace(/<[^>]*>/g, "").slice(0, 500) ||
                "",
              tier: 1,
            }));

          logger.info(`${source.name}: ${items.length} items`);
          return items;
        } catch (err) {
          logger.warn(`${source.name}: failed — ${err.message}`);
          return [];
        }
      })
    )
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
