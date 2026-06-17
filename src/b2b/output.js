import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

export function saveB2BDigest(result, today) {
  if (!existsSync(config.b2bOutputDir)) {
    mkdirSync(config.b2bOutputDir, { recursive: true });
  }

  // Save today's digest
  const digestPath = resolve(config.b2bOutputDir, `${today}.json`);
  const digest = {
    date: today,
    headline: result.headline,
    source: result.source,
    url: result.url,
    topTake: result.topTake,
    freshOrEvergreen: result.freshOrEvergreen,
  };
  writeFileSync(digestPath, JSON.stringify(digest, null, 2));
  logger.info(`B2B: Digest saved to ${digestPath}`);

  // Update sent history
  let history = { sent: [] };
  if (existsSync(config.b2bSentHistoryPath)) {
    history = JSON.parse(readFileSync(config.b2bSentHistoryPath, "utf-8"));
  }

  history.sent.push({
    url: result.url,
    dateSent: today,
    title: result.headline,
    freshOrEvergreen: result.freshOrEvergreen,
  });

  writeFileSync(config.b2bSentHistoryPath, JSON.stringify(history, null, 2));
  logger.info(`B2B: Sent history updated (${history.sent.length} total entries)`);

  return digestPath;
}
