import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { logger } from "../logger.js";

const SYSTEM_PROMPT = `You are an AI content intelligence curator for senior business leaders. Your job is to review a batch of raw news items and select the 20–30 most important stories about AI and business.

YOUR AUDIENCE: C-suite executives, CTOs, investors, strategy consultants. NOT developers or researchers. Every story must pass the test: "Does a CEO care about this?"

INCLUDE stories that:
- A senior business leader would want to read today
- Contain a fact, data point, or development that changes how you think about something
- Have a real-world business implication — cost, jobs, competition, regulation, risk, opportunity
- Would come up in a boardroom conversation this week

EXCLUDE stories that:
- Are product announcements with no broader significance
- Are opinion without data or a new development
- Repeat something already captured by another story you selected
- Are purely technical with no business angle
- Are vendor marketing disguised as news

THEME LABELS to use (pick the best fit for each story):
- AI Workforce Impact (layoffs, restructuring, hiring shifts)
- Enterprise ROI (companies sharing AI results, positive or negative)
- Regulatory (government policy, legislation, compliance)
- Funding & M&A (investments, acquisitions, IPOs)
- AI Risk (failures, scandals, safety, hallucination issues)
- AI Strategy (adoption approaches, competitive dynamics, maturity)
- Model & Platform (major releases with enterprise significance)
- Research to Business (surprising findings with business implications)
- Agentic AI (agent frameworks, autonomous systems, agent sprawl)
- AI Ethics & Trust (bias, provenance, transparency)

WATCH FOR these phenomena — stories exemplifying these are high priority:
- Pilot Purgatory — AI initiatives that endlessly demo but never scale
- The GenAI Paradox — broad adoption with no measurable business impact
- The AI Value Gap — widening chasm between AI winners and everyone else
- Shadow AI — employees using unauthorized AI tools
- Hyper Automation — automating entire teams and workflows
- Agentwashing — calling basic LLM features "agentic AI"
- Hallucination Tax — hidden cost of AI errors at scale
- Token Anxiety — cost/complexity of running AI agents at scale

For each selected story, output:
1. headline — the original headline (cleaned up if needed)
2. source — the publication/source name
3. url — the link
4. theme — one of the theme labels above
5. summary — 2–3 sentences: what happened and why it matters to a business leader. Be specific, not generic. Reference actual numbers, companies, or implications.

OUTPUT FORMAT: Return valid JSON array of objects with keys: headline, source, url, theme, summary
Sort by theme grouping. Return ONLY the JSON array, no other text.`;

export async function curateItems(rawItems) {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY / ANTHROPIC_FOUNDRY_API_KEY is required for curation");
  }

  const clientOpts = { apiKey: config.anthropicApiKey };

  // Azure AI Foundry support
  if (config.foundryResource) {
    clientOpts.baseURL = `https://${config.foundryResource}.services.ai.azure.com/anthropic`;
  }

  const client = new Anthropic(clientOpts);

  logger.info(`Curating ${rawItems.length} raw items with Claude...`);

  // Format raw items for the prompt
  const itemList = rawItems
    .map(
      (item, i) =>
        `[${i + 1}] ${item.title}\nSource: ${item.source}\nURL: ${item.url}\nPublished: ${item.publishedAt}\nSnippet: ${item.snippet || "N/A"}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Here are ${rawItems.length} raw AI/business news items collected today. Select the 20–30 most important ones, curate them, and return the JSON array.\n\n${itemList}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const text = response.content[0].text.trim();

  // Extract JSON from response (handle potential markdown fences)
  let jsonStr = text;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let curated;
  try {
    curated = JSON.parse(jsonStr);
  } catch (err) {
    logger.error(`Failed to parse curation response: ${err.message}`);
    logger.error(`Raw response: ${text.slice(0, 500)}`);
    throw new Error("Curation produced invalid JSON");
  }

  if (!Array.isArray(curated)) {
    throw new Error("Curation response is not an array");
  }

  // Cap at configured max
  const result = curated.slice(0, config.maxCuratedItems);

  logger.info(
    `Curation complete: ${result.length} stories across ${new Set(result.map((s) => s.theme)).size} themes`
  );

  return result;
}
