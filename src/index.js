import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { fetchAllSources } from "./fetchers/index.js";
import { curateItems } from "./curation/curate.js";
import { saveDigestLocally } from "./output/local.js";

const args = process.argv.slice(2);
const stepArg = args.find((a) => a.startsWith("--step="));
const step = stepArg ? stepArg.split("=")[1] : null;
const dryRun = args.includes("--dry-run");

const today = new Date().toISOString().slice(0, 10);

function dataPath(name) {
  return resolve(config.dataDir, `${today}-${name}.json`);
}

function ensureDataDir() {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
}

async function runFetch() {
  logger.info("=== STEP 1: Fetching sources ===");
  const rawItems = await fetchAllSources();
  ensureDataDir();
  writeFileSync(dataPath("raw"), JSON.stringify(rawItems, null, 2));
  logger.info(`Saved ${rawItems.length} raw items to ${dataPath("raw")}`);
  return rawItems;
}

async function runCurate(rawItems) {
  logger.info("=== STEP 2: AI Curation ===");
  if (!rawItems) {
    const rawPath = dataPath("raw");
    if (!existsSync(rawPath)) throw new Error(`No raw data found at ${rawPath}. Run fetch first.`);
    rawItems = JSON.parse(readFileSync(rawPath, "utf-8"));
  }
  const curated = await curateItems(rawItems);
  ensureDataDir();
  writeFileSync(dataPath("curated"), JSON.stringify(curated, null, 2));
  logger.info(`Saved ${curated.length} curated stories to ${dataPath("curated")}`);
  return curated;
}

async function runPublish(curated) {
  logger.info("=== STEP 3: Publishing ===");
  if (!curated) {
    const curatedPath = dataPath("curated");
    if (!existsSync(curatedPath))
      throw new Error(`No curated data found at ${curatedPath}. Run curate first.`);
    curated = JSON.parse(readFileSync(curatedPath, "utf-8"));
  }

  if (dryRun) {
    logger.info("[DRY RUN] Preview of curated stories:");
    logger.info(`Stories: ${curated.length}`);
    const themes = [...new Set(curated.map((s) => s.theme))];
    logger.info(`Themes: ${themes.join(", ")}`);
    for (const story of curated.slice(0, 3)) {
      logger.info(`  - [${story.theme}] ${story.headline}`);
    }
    return;
  }

  const { pdfPath } = await saveDigestLocally(curated, today);

  logger.info("=== Pipeline complete ===");
  logger.info(`Digest: ${pdfPath}`);
}

async function runAll() {
  const startTime = Date.now();
  logger.info(`Starting AI Content Intelligence Pipeline — ${today}`);

  try {
    const rawItems = await runFetch();
    const curated = await runCurate(rawItems);
    await runPublish(curated);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Pipeline finished in ${elapsed}s`);
  } catch (err) {
    logger.error(`Pipeline failed: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  }
}

// Run the requested step or all steps
if (step === "fetch") {
  runFetch().catch((e) => { logger.error(e.message); process.exit(1); });
} else if (step === "curate") {
  runCurate().catch((e) => { logger.error(e.message); process.exit(1); });
} else if (step === "publish") {
  runPublish().catch((e) => { logger.error(e.message); process.exit(1); });
} else {
  runAll();
}
