import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

const schedulePath = resolve(config.b2bOutputDir, "week-schedule.json");

function ensureDir() {
  if (!existsSync(config.b2bOutputDir)) mkdirSync(config.b2bOutputDir, { recursive: true });
}

export function saveWeekSchedule(schedule, weekOf) {
  ensureDir();
  const data = { weekOf, ...schedule };
  writeFileSync(schedulePath, JSON.stringify(data, null, 2));
  logger.info(`B2B: Week schedule saved for week of ${weekOf}`);
  return schedulePath;
}

export function loadWeekSchedule() {
  if (!existsSync(schedulePath)) return null;
  return JSON.parse(readFileSync(schedulePath, "utf-8"));
}

export function updateScheduleKeyNotes(day, keyNotes, question) {
  const schedule = loadWeekSchedule();
  if (!schedule) return;

  for (const topic of ["topicA", "topicB"]) {
    const res = schedule[topic].resources.find((r) => r.day === day);
    if (res) {
      res.keyNotes = keyNotes;
      res.question = question;
      break;
    }
  }

  writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
}

export function saveDailyDigest(content, dateStr) {
  ensureDir();
  const digestPath = resolve(config.b2bOutputDir, `${dateStr}.json`);
  writeFileSync(digestPath, JSON.stringify(content, null, 2));
  logger.info(`B2B: Daily digest saved to ${digestPath}`);
  return digestPath;
}

export function updateSentHistory(urls) {
  let history = { sent: [] };
  if (existsSync(config.b2bSentHistoryPath)) {
    history = JSON.parse(readFileSync(config.b2bSentHistoryPath, "utf-8"));
  }

  for (const entry of urls) {
    if (!history.sent.some((s) => s.url === entry.url)) {
      history.sent.push(entry);
    }
  }

  writeFileSync(config.b2bSentHistoryPath, JSON.stringify(history, null, 2));
  logger.info(`B2B: Sent history updated (${history.sent.length} total entries)`);
}
