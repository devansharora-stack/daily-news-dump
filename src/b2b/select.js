import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { config } from "../config.js";
import { logger } from "../logger.js";

const FRESH_SELECTION_PROMPT = `You are a B2B marketing content curator. Your job is to find the single best long-form B2B marketing resource from today's articles.

QUALITY BAR — the article MUST meet ALL of these criteria:
1. LONG-FORM: 1000+ words (not a listicle, not a news brief, not a product update)
2. REAL EVIDENCE: Names real companies, cites real numbers/metrics/outcomes
3. RESOURCE TYPE: Case study, strategy breakdown, research report, GTM analysis, or deep marketing analysis
4. ORIGINAL: Original analysis or reporting, not repackaged/aggregated content
5. ACTIONABLE: Contains specific tactics, frameworks, or lessons a B2B marketer can apply

REJECT articles that are:
- Generic "5 tips for B2B marketing" listicles
- Product announcements or vendor marketing disguised as insights
- News reports without strategic depth
- Thought leadership without evidence or specifics
- Under 1000 words based on the word count provided
- Developer/engineering focused with no marketing angle

EVALUATION: Review each candidate carefully. If ANY article meets ALL five criteria, select the single best one — the one with the strongest combination of evidence, specificity, and actionability. If NONE meet the bar, return selected: false.

OUTPUT FORMAT: Return valid JSON only, no other text:
- If a winner exists: {"selected": true, "index": <0-based index of the winning article>, "reason": "one sentence explaining why this was selected"}
- If no winner: {"selected": false, "reason": "one sentence explaining why nothing qualified"}`;

const EVERGREEN_SELECTION_PROMPT = `You are a B2B marketing content curator. Pick the single most valuable resource from this library of proven B2B marketing case studies and guides.

Choose the resource that would give a B2B marketer the most concrete, actionable insight today. Prefer variety — if multiple resources cover similar topics, pick the one that teaches something different.

OUTPUT FORMAT: Return valid JSON only, no other text:
{"index": <0-based index>, "reason": "one sentence explaining why this was picked"}`;

const TOP_TAKE_PROMPT = `You are a senior B2B marketing analyst. Given this article, write a "Top Take" — a 3-4 sentence summary of the single most actionable takeaway for a B2B marketer.

Rules:
- Name specific companies, strategies, and results where available
- Be concrete: "Snowflake increased pipeline 40% by..." not "Companies can improve..."
- Focus on what a B2B marketer can learn and apply from this
- No fluff, no hedging, no "in today's landscape" filler
- If the content is a case study, lead with the result, then explain the strategy
- If the content is a guide/framework, lead with the key insight, then explain why it matters`;

function createClient() {
  const clientOpts = { apiKey: config.anthropicApiKey };
  if (config.foundryResource) {
    clientOpts.baseURL = `https://${config.foundryResource}.services.ai.azure.com/anthropic`;
  }
  return new Anthropic(clientOpts);
}

function parseJsonResponse(text) {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  return JSON.parse(jsonStr);
}

async function selectFromFresh(client, items) {
  if (items.length === 0) return null;

  const itemList = items
    .map(
      (item, i) =>
        `[${i}] Title: ${item.title}\nSource: ${item.source}\nURL: ${item.url}\nWord Count: ${item.wordCount > 0 ? item.wordCount : "unknown — full text not available"}\nContent Preview: ${(item.fullText || item.snippet || "N/A").slice(0, 2000)}`
    )
    .join("\n\n---\n\n");

  logger.info(`B2B: Evaluating ${items.length} fresh articles with Claude...`);

  const response = await client.messages.create({
    model: config.b2bModel,
    max_tokens: 1000,
    system: FRESH_SELECTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here are ${items.length} B2B marketing articles fetched today. Evaluate each against the quality bar and select the single best one, or indicate that none qualify.\n\n${itemList}`,
      },
    ],
  });

  const result = parseJsonResponse(response.content[0].text);

  if (result.selected && typeof result.index === "number" && result.index < items.length) {
    logger.info(`B2B: Fresh selection — "${items[result.index].title}" (${result.reason})`);
    return { ...items[result.index], freshOrEvergreen: "fresh" };
  }

  logger.info(`B2B: No fresh article met the quality bar (${result.reason})`);
  return null;
}

async function selectFromEvergreen(client, sentUrls) {
  if (!existsSync(config.b2bEvergreenPath)) {
    throw new Error(`Evergreen library not found at ${config.b2bEvergreenPath}`);
  }

  const library = JSON.parse(readFileSync(config.b2bEvergreenPath, "utf-8"));
  const available = (library.entries || []).filter((e) => !sentUrls.has(e.url));

  if (available.length === 0) {
    throw new Error("All evergreen resources have been sent. Please add more entries to config/b2b-evergreen.json");
  }

  const itemList = available
    .map(
      (entry, i) =>
        `[${i}] Title: ${entry.title}\nSource: ${entry.source}\nCategory: ${entry.category}\nSnippet: ${entry.snippet}`
    )
    .join("\n\n---\n\n");

  logger.info(`B2B: Selecting from ${available.length} evergreen resources...`);

  const response = await client.messages.create({
    model: config.b2bModel,
    max_tokens: 500,
    system: EVERGREEN_SELECTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `Pick the single best resource from this library of ${available.length} proven B2B marketing case studies:\n\n${itemList}`,
      },
    ],
  });

  const result = parseJsonResponse(response.content[0].text);

  if (typeof result.index === "number" && result.index < available.length) {
    const selected = available[result.index];
    logger.info(`B2B: Evergreen selection — "${selected.title}" (${result.reason})`);
    return {
      title: selected.title,
      url: selected.url,
      source: selected.source,
      snippet: selected.snippet,
      fullText: null,
      wordCount: 0,
      freshOrEvergreen: "evergreen",
    };
  }

  throw new Error("Claude failed to select an evergreen resource");
}

async function generateTopTake(client, article) {
  const contentForAnalysis = article.fullText
    ? article.fullText.slice(0, 6000)
    : article.snippet || "";

  logger.info("B2B: Generating top take...");

  const response = await client.messages.create({
    model: config.b2bModel,
    max_tokens: 500,
    system: TOP_TAKE_PROMPT,
    messages: [
      {
        role: "user",
        content: `Article: "${article.title}"\nSource: ${article.source}\nURL: ${article.url}\n\nContent:\n${contentForAnalysis}`,
      },
    ],
  });

  return response.content[0].text.trim();
}

export async function selectB2BResource(freshItems, sentUrls) {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY / ANTHROPIC_FOUNDRY_API_KEY is required for B2B selection");
  }

  const client = createClient();

  // Pass 1: try fresh content
  let selected = await selectFromFresh(client, freshItems);

  // Pass 2: fall back to evergreen
  if (!selected) {
    selected = await selectFromEvergreen(client, sentUrls);
  }

  // Generate top take
  const topTake = await generateTopTake(client, selected);

  return {
    headline: selected.title,
    source: selected.source,
    url: selected.url,
    topTake,
    freshOrEvergreen: selected.freshOrEvergreen,
  };
}
