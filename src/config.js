import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env manually (no dotenv dependency)
const envPath = resolve(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

export const config = {
  root: ROOT,
  dataDir: resolve(ROOT, "data"),

  anthropicApiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY || process.env.ANTHROPIC_API_KEY,
  foundryResource: process.env.ANTHROPIC_FOUNDRY_RESOURCE,
  maxRawItems: parseInt(process.env.MAX_RAW_ITEMS || "100", 10),
  maxCuratedItems: parseInt(process.env.MAX_CURATED_ITEMS || "30", 10),
};
