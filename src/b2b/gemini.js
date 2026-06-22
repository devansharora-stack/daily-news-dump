import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { logger } from "../logger.js";

let genaiClient = null;

function getClient() {
  if (!genaiClient) {
    if (!config.gcpProjectId) throw new Error("GCP_PROJECT_ID is required for Gemini");
    genaiClient = new GoogleGenAI({
      vertexai: true,
      project: config.gcpProjectId,
      location: config.gcpLocation,
    });
  }
  return genaiClient;
}

// Tolerant parser: handles fenced output and recovers complete objects from a
// truncated array (grounded responses can be cut off mid-array by the token cap).
function parseJsonFromGemini(text) {
  let jsonStr = (text || "").trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  const start = jsonStr.search(/[{[]/);
  if (start === -1) throw new Error("No JSON found in Gemini response: " + (text || "").slice(0, 200));

  const lastBrace = jsonStr.lastIndexOf("}");
  const lastBracket = jsonStr.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  const candidate = end > start ? jsonStr.slice(start, end + 1) : jsonStr.slice(start);

  try {
    return JSON.parse(candidate);
  } catch {
    // Recover from a truncated array by collecting complete top-level objects.
    const objects = [];
    let depth = 0;
    let objStart = -1;
    for (let i = 0; i < jsonStr.length; i++) {
      const ch = jsonStr[i];
      if (ch === "{") {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart !== -1) {
          try {
            objects.push(JSON.parse(jsonStr.slice(objStart, i + 1)));
          } catch {
            // skip malformed object
          }
          objStart = -1;
        }
      }
    }
    if (objects.length > 0) return objects;
    throw new Error("Unparseable Gemini JSON: " + candidate.slice(0, 200));
  }
}

async function generate({ prompt, grounded = false }) {
  const ai = getClient();
  const genConfig = { temperature: 0.3, maxOutputTokens: 8192 };
  if (grounded) {
    genConfig.tools = [{ googleSearch: {} }];
  } else {
    genConfig.responseMimeType = "application/json";
  }

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: genConfig,
  });

  return response.text;
}

// --- Grounded article search (supplements RSS pipeline) ---
export async function fetchGroundedArticles(topics = []) {
  const topicList = topics.length > 0
    ? topics.join(", ")
    : "B2B marketing strategy, demand generation, account-based marketing, content marketing, go-to-market, B2B case studies";

  const prompt = `Find 8 recent, high-quality B2B marketing articles published in the last 7 days. Focus on these topics: ${topicList}.

Requirements for each article:
- Must be a case study, strategy deep-dive, research report, or expert analysis
- Must be from a reputable source (not press releases or sponsored content)
- Must be substantial (not a listicle or news brief)
- Must include real company examples or real data

Return valid JSON only, no other text. Keep each URL as the plain canonical article URL and each description to one short sentence:
[
  {"title": "article title", "url": "https://...", "source": "publisher name", "snippet": "one short sentence"}
]`;

  logger.info("B2B Gemini: Searching for grounded articles...");

  try {
    const text = await generate({ prompt, grounded: true });
    const articles = parseJsonFromGemini(text);

    logger.info(`B2B Gemini: Found ${articles.length} grounded articles`);

    return articles
      .filter((a) => a && a.url && a.title)
      .map((a) => ({
        title: a.title,
        url: a.url,
        source: a.source,
        snippet: a.snippet,
        tier: 3,
        fetchedVia: "gemini-grounding",
      }));
  } catch (err) {
    logger.warn(`B2B Gemini: Grounded search failed — ${err.message}`);
    return [];
  }
}

// --- Key Notes + Question generator ---
export async function geminiKeyNotesAndQuestion(article) {
  const content = article.fullText || article.snippet || "";

  logger.info(`B2B Gemini: Generating key notes for "${article.headline}"...`);

  const prompt = `You are a teacher who makes complex B2B marketing concepts easy for anyone to understand. You are writing for people who may have ZERO marketing background.

You will receive an article about B2B marketing. Your job is to write:
1. KEY NOTES: 4-5 bullet points that capture the most important lessons
2. QUESTION: One thought-provoking question that makes the reader think

RULES FOR KEY NOTES:
- Write as if explaining to a smart friend who has never worked in marketing
- ABSOLUTELY NO JARGON. If you must use a marketing term, explain what it means in the same sentence
- Every bullet MUST reference something actually stated in the article. Do NOT make up facts, numbers, or company names
- If the article mentions a specific number, use it. If not, don't invent one
- Each bullet: 1-2 sentences max
- Start each bullet with the most interesting or surprising part

RULES FOR THE QUESTION:
- Must be open-ended (not yes/no)
- Should connect the article's lesson to the reader's own work
- Should make someone pause and actually think
- Reference something specific from the article
- Even someone outside marketing should find it interesting

ANTI-HALLUCINATION: ONLY use information from the article text below. If the article doesn't say something, don't say it.

Article Title: "${article.headline}"
Source: ${article.source}
URL: ${article.url}

Full Article Text:
${content}

Return valid JSON only, no other text:
{"keyNotes": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"], "question": "your question here"}`;

  const text = await generate({ prompt });
  return parseJsonFromGemini(text);
}

// --- Topic Recap (Thursday) ---
export async function geminiTopicRecap(topicName, resources) {
  const resourceSummary = resources
    .map(
      (r, i) =>
        `Article ${i + 1}: "${r.headline}" (${r.source})\nKey Notes: ${(r.keyNotes || []).join(" | ")}`
    )
    .join("\n\n");

  logger.info(`B2B Gemini: Generating recap for "${topicName}"...`);

  const prompt = `You are a friendly teacher summarizing what your students learned this week. You're connecting 3 articles on the same B2B marketing topic into one flowing story.

FORMAT:
- Start with a warm 1-2 sentence intro that tells the reader what this week's topic was about, in the simplest words possible
- Then 2-3 bullet points that FLOW like a story — each bullet should build on the previous one:
  - Bullet 1: "First, we saw that..." (the foundational insight from Article 1)
  - Bullet 2: "Then we learned that..." or "Building on that..." (how Article 2 deepened the understanding)
  - Bullet 3: "Finally..." or "The big picture is..." (how Article 3 tied it all together or showed the real-world impact)

LANGUAGE RULES:
- Write like you're texting a friend — casual, clear, zero effort to understand
- If a 15-year-old wouldn't understand a sentence on the first read, rewrite it
- Use "you" and "we" — make it personal
- Explain any concept inline: don't say "semantic dilution", say "when you spread your ideas across too many similar pages, none of them feels like THE answer"
- Use real examples from the articles (company names, numbers) to make it concrete, not abstract

ANTI-HALLUCINATION: ONLY reference facts from the key notes provided. Do not add your own knowledge.

Topic: ${topicName}

Articles covered:

${resourceSummary}

Return valid JSON only, no other text:
{"intro": "warm 1-2 sentence context", "bullets": ["first we saw...", "then we learned...", "the big picture..."]}`;

  const text = await generate({ prompt });
  return parseJsonFromGemini(text);
}

// --- Week Recap (Sunday) ---
export async function geminiWeekRecap(topicAName, topicBName, allResources) {
  const resourceSummary = allResources
    .map(
      (r, i) =>
        `Article ${i + 1}: "${r.headline}" (${r.source})\nURL: ${r.url}\nTopic: ${r.topic}\nKey Notes: ${(r.keyNotes || []).join(" | ")}`
    )
    .join("\n\n");

  logger.info("B2B Gemini: Generating full week recap...");

  const prompt = `You are a friendly teacher wrapping up a week of B2B marketing learning. Summarize both topics covered this week.

You have 6 articles across 2 topics (Topic A from Mon-Wed, Topic B introduced Thu and continued Fri-Sat).

FORMAT:
- Start with a 1-2 sentence intro: "This week you explored two areas of B2B marketing..." — make it warm and conversational
- Then 3-4 short bullet points highlighting the most interesting things learned (mix from both topics)
- End with a closing one-liner starting with "This week you learned..." that captures the single biggest takeaway
- Each bullet is ONE sentence — short and clear
- Plain, simple language — no jargon

ANTI-HALLUCINATION: ONLY reference facts from the key notes provided.

Topic A: ${topicAName}
Topic B: ${topicBName}

All articles:

${resourceSummary}

Return valid JSON only, no other text:
{"intro": "1-2 sentence warm intro", "bullets": ["highlight 1", "highlight 2", "highlight 3"], "closing": "This week you learned..."}`;

  const text = await generate({ prompt });
  return parseJsonFromGemini(text);
}
