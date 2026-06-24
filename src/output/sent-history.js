import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

const WINDOW_DAYS = 14;

export function newsKey(url) {
  if (!url) return null;
  return url.split("?")[0].replace(/\/+$/, "");
}

function load() {
  if (!existsSync(config.newsSentHistoryPath)) return { sent: [] };
  try {
    return JSON.parse(readFileSync(config.newsSentHistoryPath, "utf-8"));
  } catch {
    return { sent: [] };
  }
}

// Set of story keys sent within the rolling window — used to filter the raw pool.
export function loadSentNewsKeys(windowDays = WINDOW_DAYS) {
  const cutoff = Date.now() - windowDays * 86400000;
  return new Set(
    (load().sent || [])
      .filter((e) => new Date(e.date).getTime() >= cutoff)
      .map((e) => e.key)
  );
}

// Record the keys of stories that just went out, pruning entries past the window.
export function recordSentNews(stories, dateStr, windowDays = WINDOW_DAYS) {
  const history = load();
  history.sent ||= [];
  const have = new Set(history.sent.map((e) => e.key));

  let added = 0;
  for (const s of stories) {
    const key = newsKey(s.url);
    if (key && !have.has(key)) {
      history.sent.push({ key, date: dateStr });
      have.add(key);
      added++;
    }
  }

  const cutoff = Date.now() - windowDays * 86400000;
  history.sent = history.sent.filter((e) => new Date(e.date).getTime() >= cutoff);

  mkdirSync(dirname(config.newsSentHistoryPath), { recursive: true });
  writeFileSync(config.newsSentHistoryPath, JSON.stringify(history, null, 2));
  logger.info(`Sent-history updated: +${added} new keys (${history.sent.length} in last ${windowDays}d)`);
}
