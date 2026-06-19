import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { fetchB2BSources } from "./b2b/fetch.js";
import { enrichArticles } from "./b2b/enrich.js";
import { planWeek } from "./b2b/select.js";
import {
  fetchGroundedArticles,
  geminiKeyNotesAndQuestion,
  geminiTopicRecap,
  geminiWeekRecap,
} from "./b2b/gemini.js";
import {
  saveWeekSchedule,
  loadWeekSchedule,
  updateScheduleKeyNotes,
  saveDailyDigest,
  updateSentHistory,
} from "./b2b/output.js";

const args = process.argv.slice(2);
const stepArg = args.find((a) => a.startsWith("--step="));
const step = stepArg ? stepArg.split("=")[1] : null;

const today = new Date().toISOString().slice(0, 10);
const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const todayName = DAY_NAMES[dayOfWeek];

function dataPath(name) {
  return resolve(config.dataDir, `${today}-b2b-${name}.json`);
}

function ensureDataDir() {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
}

// === WEEKLY PLANNER (Sunday night) ===
async function runPlanWeek() {
  const startTime = Date.now();
  logger.info(`B2B Weekly Planner — ${today}`);

  logger.info("=== STEP 1: Fetching B2B sources ===");
  const { freshItems, sentUrls } = await fetchB2BSources();

  // Supplement with Gemini grounded search
  logger.info("=== STEP 1b: Gemini grounded search ===");
  const geminiArticles = await fetchGroundedArticles();
  const existingUrls = new Set(freshItems.map((i) => i.url));
  const newFromGemini = geminiArticles.filter((a) => !existingUrls.has(a.url));
  const allItems = [...freshItems, ...newFromGemini];
  logger.info(`B2B: ${newFromGemini.length} new articles from Gemini grounding (${allItems.length} total)`);

  ensureDataDir();
  writeFileSync(dataPath("raw"), JSON.stringify(allItems, null, 2));
  logger.info(`B2B: Saved ${allItems.length} items`);

  logger.info("=== STEP 2: Enriching articles ===");
  const enriched = await enrichArticles(allItems);

  logger.info("=== STEP 3: Planning the week ===");
  const schedule = await planWeek(enriched, sentUrls);

  const mondayDate = getNextMonday(today);
  saveWeekSchedule(schedule, mondayDate);

  // Mark all selected URLs as sent
  const allResources = [...schedule.topicA.resources, ...schedule.topicB.resources];
  updateSentHistory(
    allResources.map((r) => ({ url: r.url, dateSent: today, title: r.headline }))
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`B2B Weekly Planner finished in ${elapsed}s`);
}

// === DAILY RUNNER ===
async function runDaily() {
  const startTime = Date.now();
  logger.info(`B2B Daily Runner — ${today} (${todayName})`);

  const schedule = loadWeekSchedule();
  if (!schedule) {
    logger.error("No week-schedule.json found. Run plan-week first.");
    process.exit(1);
  }

  logger.info(`B2B: Loaded schedule — Topic A: "${schedule.topicA.name}", Topic B: "${schedule.topicB.name}"`);

  let digest;

  if (todayName === "sunday") {
    digest = await handleSunday(schedule);
  } else if (todayName === "thursday") {
    digest = await handleThursday(schedule);
  } else if (["monday", "tuesday", "wednesday"].includes(todayName)) {
    digest = await handleResourceDay(schedule, todayName, "topicA");
  } else if (["friday", "saturday"].includes(todayName)) {
    digest = await handleResourceDay(schedule, todayName, "topicB");
  } else {
    logger.info("B2B: No delivery scheduled for today.");
    return;
  }

  saveDailyDigest(digest, today);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`B2B Daily Runner finished in ${elapsed}s`);
}

// --- Resource day (Mon/Tue/Wed/Fri/Sat) ---
async function handleResourceDay(schedule, day, topicKey) {
  const topic = schedule[topicKey];
  const resource = topic.resources.find((r) => r.day === day);

  if (!resource) {
    throw new Error(`No resource found for ${day} in ${topicKey}`);
  }

  const dayIndex = topic.resources.indexOf(resource) + 1;
  const totalDays = topic.resources.length;

  logger.info(`B2B: Resource day — "${resource.headline}" (Day ${dayIndex} of ${totalDays})`);

  const { keyNotes, question } = await geminiKeyNotesAndQuestion(resource);

  updateScheduleKeyNotes(day, keyNotes, question);

  return {
    date: today,
    type: "resource",
    topic: topic.name,
    dayLabel: `Day ${dayIndex} of ${totalDays}`,
    headline: resource.headline,
    source: resource.source,
    url: resource.url,
    keyNotes,
    question,
  };
}

// --- Thursday: Topic A recap + Topic B intro ---
async function handleThursday(schedule) {
  logger.info("B2B: Thursday — generating Topic A recap + Topic B intro");

  // Generate recap for Topic A (Mon-Wed resources)
  const topicAResources = schedule.topicA.resources.filter((r) =>
    ["monday", "tuesday", "wednesday"].includes(r.day)
  );
  const recap = await geminiTopicRecap(schedule.topicA.name, topicAResources);

  // Generate key notes for Topic B intro (Thursday resource)
  const thursdayResource = schedule.topicB.resources.find((r) => r.day === "thursday");
  if (!thursdayResource) {
    throw new Error("No Thursday resource found in Topic B");
  }

  const { keyNotes, question } = await geminiKeyNotesAndQuestion(thursdayResource);
  updateScheduleKeyNotes("thursday", keyNotes, question);

  return {
    date: today,
    type: "recap-and-resource",
    recapTopic: schedule.topicA.name,
    recap,
    recapResources: topicAResources.map((r) => ({
      headline: r.headline,
      source: r.source,
      url: r.url,
    })),
    topic: schedule.topicB.name,
    dayLabel: "Day 1 of 3 — Intro",
    headline: thursdayResource.headline,
    source: thursdayResource.source,
    url: thursdayResource.url,
    keyNotes,
    question,
  };
}

// --- Sunday: Full week recap ---
async function handleSunday(schedule) {
  logger.info("B2B: Sunday — generating full week recap");

  const allResources = [
    ...schedule.topicA.resources.map((r) => ({ ...r, topic: schedule.topicA.name })),
    ...schedule.topicB.resources.map((r) => ({ ...r, topic: schedule.topicB.name })),
  ];

  const recap = await geminiWeekRecap(schedule.topicA.name, schedule.topicB.name, allResources);

  return {
    date: today,
    type: "recap-week",
    topicA: schedule.topicA.name,
    topicB: schedule.topicB.name,
    recap,
    resources: allResources.map((r) => ({
      headline: r.headline,
      source: r.source,
      url: r.url,
      topic: r.topic,
    })),
  };
}

function getNextMonday(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d.toISOString().slice(0, 10);
}

// --- Entry point ---
if (step === "plan-week") {
  runPlanWeek().catch((e) => {
    logger.error(`B2B Plan Week failed: ${e.message}`);
    logger.error(e.stack);
    process.exit(1);
  });
} else {
  runDaily().catch((e) => {
    logger.error(`B2B Daily Runner failed: ${e.message}`);
    logger.error(e.stack);
    process.exit(1);
  });
}
