import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { fetchB2BSources } from "./b2b/fetch.js";
import { enrichArticles } from "./b2b/enrich.js";
import { selectB2BResource } from "./b2b/select.js";
import { saveB2BDigest } from "./b2b/output.js";

const args = process.argv.slice(2);
const stepArg = args.find((a) => a.startsWith("--step="));
const step = stepArg ? stepArg.split("=")[1] : null;

const today = new Date().toISOString().slice(0, 10);

function dataPath(name) {
  return resolve(config.dataDir, `${today}-b2b-${name}.json`);
}

function ensureDataDir() {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
}

async function runFetch() {
  logger.info("=== B2B STEP 1: Fetching sources ===");
  const { freshItems, sentUrls } = await fetchB2BSources();
  ensureDataDir();
  writeFileSync(dataPath("raw"), JSON.stringify(freshItems, null, 2));
  logger.info(`B2B: Saved ${freshItems.length} fresh items to ${dataPath("raw")}`);
  return { freshItems, sentUrls };
}

async function runSelect(freshItems, sentUrls) {
  logger.info("=== B2B STEP 2: Enrich + Select + Top Take ===");

  if (!freshItems) {
    const rawPath = dataPath("raw");
    if (!existsSync(rawPath)) throw new Error(`No B2B raw data found at ${rawPath}. Run fetch first.`);
    freshItems = JSON.parse(readFileSync(rawPath, "utf-8"));
  }

  // Load sent URLs if not provided
  if (!sentUrls) {
    if (existsSync(config.b2bSentHistoryPath)) {
      const history = JSON.parse(readFileSync(config.b2bSentHistoryPath, "utf-8"));
      sentUrls = new Set((history.sent || []).map((e) => e.url));
    } else {
      sentUrls = new Set();
    }
  }

  // Enrich articles with full text
  const enriched = await enrichArticles(freshItems);

  // Select best resource (two-pass) + generate top take
  const result = await selectB2BResource(enriched, sentUrls);

  ensureDataDir();
  writeFileSync(dataPath("selected"), JSON.stringify(result, null, 2));
  logger.info(`B2B: Selected "${result.headline}" (${result.freshOrEvergreen})`);
  return result;
}

async function runPublish(result) {
  logger.info("=== B2B STEP 3: Publishing ===");

  if (!result) {
    const selectedPath = dataPath("selected");
    if (!existsSync(selectedPath))
      throw new Error(`No B2B selection found at ${selectedPath}. Run select first.`);
    result = JSON.parse(readFileSync(selectedPath, "utf-8"));
  }

  const digestPath = saveB2BDigest(result, today);

  logger.info("=== B2B Pipeline complete ===");
  logger.info(`Digest: ${digestPath}`);
}

async function runAll() {
  const startTime = Date.now();
  logger.info(`Starting B2B Marketing Resource Pipeline — ${today}`);

  try {
    const { freshItems, sentUrls } = await runFetch();
    const result = await runSelect(freshItems, sentUrls);
    await runPublish(result);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`B2B Pipeline finished in ${elapsed}s`);
  } catch (err) {
    logger.error(`B2B Pipeline failed: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  }
}

if (step === "fetch") {
  runFetch().catch((e) => { logger.error(e.message); process.exit(1); });
} else if (step === "select") {
  runSelect().catch((e) => { logger.error(e.message); process.exit(1); });
} else if (step === "publish") {
  runPublish().catch((e) => { logger.error(e.message); process.exit(1); });
} else {
  runAll();
}
