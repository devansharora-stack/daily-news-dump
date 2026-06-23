import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { config } from "../config.js";
import { logger } from "../logger.js";

// --- PROMPT: Weekly Planner (Sunday night) ---
const WEEKLY_PLANNER_PROMPT = `You are a B2B marketing learning curator. Your job is to plan a week of structured learning for a team that wants to understand how real B2B marketing works.

You will receive a batch of articles. You must select exactly 6 articles and organize them into 2 topics.

TOPIC A (Monday, Tuesday, Wednesday): Pick 3 articles on the same B2B marketing theme.
TOPIC B (Thursday intro, Friday, Saturday): Pick 3 articles on a DIFFERENT B2B marketing theme.

HOW TO PICK TOPICS:
- Look at what's actually available. Don't force a topic — let the articles tell you what the two strongest themes are this week.
- Good topics: Account-Based Marketing, Content Marketing, Product-Led Growth, Demand Generation, B2B Branding, Go-To-Market Strategy, B2B SEO, Email Marketing, Marketing Analytics, Customer Retention.
- The two topics MUST be different from each other.

HOW TO ORDER ARTICLES WITHIN A TOPIC:
- Article 1 should be the most introductory or foundational — something that explains the concept
- Article 2 should go deeper — a specific example or case study
- Article 3 should be the most advanced or actionable — a framework, playbook, or results breakdown
- For Topic B: Article 1 (Thursday) is an intro/teaser, Articles 2-3 (Friday-Saturday) go deeper

QUALITY BAR — every article MUST:
- Be a case study, strategy breakdown, research report, or deep analysis (NOT a listicle or news brief)
- Name real companies or cite real data
- Be substantial enough to learn something meaningful from
- Be original analysis, not repackaged content

OUTPUT FORMAT: Return valid JSON only, no other text:
{
  "topicA": {
    "name": "topic name in plain English",
    "resources": [
      {"index": <0-based index from the input list>, "day": "monday"},
      {"index": <0-based index>, "day": "tuesday"},
      {"index": <0-based index>, "day": "wednesday"}
    ]
  },
  "topicB": {
    "name": "topic name in plain English",
    "resources": [
      {"index": <0-based index>, "day": "thursday"},
      {"index": <0-based index>, "day": "friday"},
      {"index": <0-based index>, "day": "saturday"}
    ]
  }
}`;

// --- PROMPT: Key Notes + Question (resource days) ---
const KEY_NOTES_PROMPT = `You are a teacher who makes complex B2B marketing concepts easy for anyone to understand. You are writing for people who may have ZERO marketing background.

You will receive an article about B2B marketing. Your job is to write:
1. KEY NOTES: 4-5 bullet points that capture the most important lessons from this article
2. QUESTION: One thought-provoking question that makes the reader stop and think

RULES FOR KEY NOTES:
- Write as if you're explaining to a smart friend who has never worked in marketing
- ABSOLUTELY NO JARGON. If you must use a marketing term (like "ABM" or "pipeline"), explain what it means in the same sentence. Example: "They used account-based marketing (basically, instead of advertising to everyone, they picked specific companies they wanted as customers and created personalized campaigns just for them)"
- Every single bullet point MUST reference something that is actually stated in the article. Do NOT make up facts, numbers, or company names that aren't in the article
- If the article mentions a specific number (like "revenue grew 40%"), use it. If it doesn't mention specific numbers, don't invent them — say "the article describes how..." instead
- Each bullet should be 1-2 sentences maximum
- Start each bullet with the most interesting or surprising part
- A person who reads ONLY your key notes should walk away having learned something concrete

RULES FOR THE QUESTION:
- Must be open-ended (not a yes/no question)
- Should connect the article's lesson to the reader's own work or thinking
- Should make someone pause and actually think, not just recall a fact
- Reference something specific from the article
- Even someone outside marketing should find it interesting to think about
- Example of a GOOD question: "Snowflake focused on just 500 target companies instead of millions — if your team could only focus on 10 customers, how would you decide which 10?"
- Example of a BAD question: "What do you think about ABM strategies?" (too vague, uses jargon)

ANTI-HALLUCINATION RULES:
- You are given the actual article text. ONLY use information from this text.
- If the article doesn't say something, you don't say it either.
- Never write "the company achieved X" unless the article explicitly states that result.
- When in doubt, use softer language: "the article describes...", "according to the author...", "the case study suggests..."
- Do NOT add external knowledge about the companies mentioned. Stick to what THIS article says.

OUTPUT FORMAT: Return valid JSON only, no other text:
{
  "keyNotes": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"],
  "question": "your question here"
}`;

// --- PROMPT: Thursday Recap (Topic A) ---
const TOPIC_RECAP_PROMPT = `You are a friendly teacher summarizing what your students learned this week. You're connecting 3 articles on the same B2B marketing topic into one flowing story.

FORMAT:
- Start with a warm 1-2 sentence intro that tells the reader what this week's topic was about, in the simplest words possible
- Then 2-3 bullet points that FLOW like a story — each bullet should build on the previous one:
  - Bullet 1: "First, we saw that..." (the foundational insight from Article 1)
  - Bullet 2: "Then we learned that..." or "Building on that..." (how Article 2 deepened the understanding)
  - Bullet 3: "Finally..." or "The big picture is..." (how Article 3 tied it all together)

LANGUAGE RULES:
- Write like you're texting a friend — casual, clear, zero effort to understand
- If a 15-year-old wouldn't understand a sentence on the first read, rewrite it
- Use "you" and "we" — make it personal
- Explain any concept inline: don't say "semantic dilution", say "when you spread your ideas across too many similar pages, none of them feels like THE answer"
- Use real examples from the articles (company names, numbers) to make it concrete

ANTI-HALLUCINATION RULES:
- ONLY reference facts that appear in the key notes provided
- Do not add any information from your own knowledge

OUTPUT FORMAT: Return valid JSON only, no other text:
{"intro": "warm 1-2 sentence context", "bullets": ["first we saw...", "then we learned...", "the big picture..."]}`;

// --- PROMPT: Sunday Full Week Recap ---
const WEEK_RECAP_PROMPT = `You are a friendly teacher wrapping up a week of B2B marketing learning. Write a recap that summarizes both topics covered this week.

You will receive information about 6 articles across 2 topics (Topic A from Monday-Wednesday, Topic B introduced Thursday and continued Friday-Saturday).

RULES:
- Write exactly 4-5 short bullet points:
  - 1-2 bullets summarizing what was learned from Topic A
  - 1-2 bullets summarizing what was learned from Topic B
  - 1 final bullet starting with "This week you learned..." that captures the single biggest takeaway
- Each bullet is ONE sentence — keep it short and clear
- Use plain, simple language — no jargon, no buzzwords

ANTI-HALLUCINATION RULES:
- You are given the titles, sources, URLs, and key notes from each article
- ONLY reference facts that appear in the key notes provided
- Do not add any information from your own knowledge
- If the key notes mention a company or number, you can reference it. If they don't, you can't.

OUTPUT FORMAT: Return valid JSON only, no other text:
{"intro": "1-2 sentence warm intro", "bullets": ["highlight 1", "highlight 2", "highlight 3"], "closing": "This week you learned..."}`;

function createClient() {
  // maxRetries bumped from the SDK default of 2 to ride out transient 5xx/429
  // blips — the weekly planner runs only once a week and gates the whole week.
  const clientOpts = { apiKey: config.anthropicApiKey, maxRetries: 5 };
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

export async function planWeek(enrichedItems, sentUrls) {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY / ANTHROPIC_FOUNDRY_API_KEY is required");
  }

  const client = createClient();

  // Filter out sent URLs
  const available = enrichedItems.filter((item) => !sentUrls.has(item.url));

  if (available.length < 6) {
    logger.warn(`B2B: Only ${available.length} fresh articles available. Supplementing with evergreen.`);
  }

  // Add evergreen items if needed
  let candidates = [...available];
  if (candidates.length < 20 && existsSync(config.b2bEvergreenPath)) {
    const library = JSON.parse(readFileSync(config.b2bEvergreenPath, "utf-8"));
    const evergreenAvailable = (library.entries || [])
      .filter((e) => !sentUrls.has(e.url))
      .map((e) => ({
        title: e.title,
        url: e.url,
        source: e.source,
        snippet: e.snippet,
        fullText: null,
        wordCount: 0,
      }));
    candidates = [...candidates, ...evergreenAvailable];
  }

  if (candidates.length < 6) {
    throw new Error("Not enough articles available to plan a week. Need at least 6.");
  }

  const itemList = candidates
    .map(
      (item, i) =>
        `[${i}] Title: ${item.title}\nSource: ${item.source}\nURL: ${item.url}\nWord Count: ${item.wordCount > 0 ? item.wordCount : "unknown"}\nContent Preview: ${(item.fullText || item.snippet || "N/A").slice(0, 1500)}`
    )
    .join("\n\n---\n\n");

  logger.info(`B2B: Planning week from ${candidates.length} candidates...`);

  const response = await client.messages.create({
    model: config.b2bModel,
    max_tokens: 2000,
    system: WEEKLY_PLANNER_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here are ${candidates.length} B2B marketing articles. Pick the 6 best ones and organize them into 2 topics for the week.\n\n${itemList}`,
      },
    ],
  });

  const plan = parseJsonResponse(response.content[0].text);

  // Build the schedule with full article data
  const schedule = {
    topicA: {
      name: plan.topicA.name,
      resources: plan.topicA.resources.map((r) => ({
        headline: candidates[r.index].title,
        source: candidates[r.index].source,
        url: candidates[r.index].url,
        fullText: (candidates[r.index].fullText || candidates[r.index].snippet || "").slice(0, 6000),
        day: r.day,
      })),
    },
    topicB: {
      name: plan.topicB.name,
      resources: plan.topicB.resources.map((r) => ({
        headline: candidates[r.index].title,
        source: candidates[r.index].source,
        url: candidates[r.index].url,
        fullText: (candidates[r.index].fullText || candidates[r.index].snippet || "").slice(0, 6000),
        day: r.day,
      })),
    },
  };

  logger.info(`B2B: Week planned — Topic A: "${schedule.topicA.name}", Topic B: "${schedule.topicB.name}"`);
  return schedule;
}

export async function generateKeyNotesAndQuestion(article) {
  const client = createClient();

  const content = article.fullText || article.snippet || "";

  logger.info(`B2B: Generating key notes for "${article.headline}"...`);

  const response = await client.messages.create({
    model: config.b2bModel,
    max_tokens: 1000,
    system: KEY_NOTES_PROMPT,
    messages: [
      {
        role: "user",
        content: `Article Title: "${article.headline}"\nSource: ${article.source}\nURL: ${article.url}\n\nFull Article Text:\n${content}`,
      },
    ],
  });

  return parseJsonResponse(response.content[0].text);
}

export async function generateTopicRecap(topicName, resources) {
  const client = createClient();

  const resourceSummary = resources
    .map(
      (r, i) =>
        `Article ${i + 1}: "${r.headline}" (${r.source})\nKey Notes: ${(r.keyNotes || []).join(" | ")}`
    )
    .join("\n\n");

  logger.info(`B2B: Generating recap for "${topicName}"...`);

  const response = await client.messages.create({
    model: config.b2bModel,
    max_tokens: 500,
    system: TOPIC_RECAP_PROMPT,
    messages: [
      {
        role: "user",
        content: `Topic: ${topicName}\n\nArticles covered this week:\n\n${resourceSummary}`,
      },
    ],
  });

  return parseJsonResponse(response.content[0].text);
}

export async function generateWeekRecap(topicAName, topicBName, allResources) {
  const client = createClient();

  const resourceSummary = allResources
    .map(
      (r, i) =>
        `Article ${i + 1}: "${r.headline}" (${r.source})\nURL: ${r.url}\nTopic: ${r.topic}\nKey Notes: ${(r.keyNotes || []).join(" | ")}`
    )
    .join("\n\n");

  logger.info("B2B: Generating full week recap...");

  const response = await client.messages.create({
    model: config.b2bModel,
    max_tokens: 800,
    system: WEEK_RECAP_PROMPT,
    messages: [
      {
        role: "user",
        content: `Topic A: ${topicAName}\nTopic B: ${topicBName}\n\nAll articles from this week:\n\n${resourceSummary}`,
      },
    ],
  });

  return parseJsonResponse(response.content[0].text);
}
