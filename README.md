# AI Content Intelligence Pipeline

A fully automated daily pipeline that scours the internet for AI + business news, uses Claude to curate the signal from the noise, and delivers a polished digest as a PDF.

Every day, the pipeline:
1. **Fetches** 80-100+ raw items from 25+ sources (RSS feeds, web scraping, Google News)
2. **Curates** them down to 20-30 stories using Claude AI with a strict business-leader lens
3. **Publishes** a formatted PDF digest grouped by theme

## Quick Start

### Prerequisites
- Node.js 18+
- An Anthropic API key (or Azure AI Foundry credentials)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/daily-updates.git
cd daily-updates
npm install
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Direct Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# OR Azure AI Foundry
ANTHROPIC_FOUNDRY_API_KEY=your-key
ANTHROPIC_FOUNDRY_RESOURCE=your-resource-name
```

### Run

```bash
# Full pipeline: fetch -> curate -> publish
npm start

# Run individual steps
npm run fetch       # Step 1: Collect raw items from sources
npm run curate      # Step 2: AI curation (requires fetch first)
npm run publish     # Step 3: Generate PDF (requires curate first)

# Preview without generating PDF
npm run dry-run
```

### Output

Digests are saved to `digests/`:
- `2026-03-25.pdf` — Shareable PDF digest
- `2026-03-25.html` — Browser version
- `2026-03-25.json` — Raw curated data

Intermediate data is saved to `data/`:
- `2026-03-25-raw.json` — All fetched items before curation
- `2026-03-25-curated.json` — Curated items after AI filtering

## Daily Automation

Set up a cron job to run at 2pm daily:

```bash
crontab -e
```

Add:
```
0 14 * * * cd /path/to/daily-updates && /usr/local/bin/node src/index.js >> data/cron.log 2>&1
```

## Sources

### Tier 1 — RSS Feeds (structured, reliable)
TechCrunch, VentureBeat, MIT Technology Review, The Verge, Wired, Reuters, CNBC, Fortune, Ars Technica, Hacker News, OpenAI Blog, Anthropic Blog, Google DeepMind Blog, Stanford HAI, arXiv (cs.AI)

### Tier 2 — Web Scraping
McKinsey Insights, BCG, Deloitte Insights, Harvard Business Review, Gartner, Bloomberg, Financial Times, The Information

### Tier 3 — Search (best effort)
Google News AI/business search, X/Twitter (requires API credentials)

Sources are configured in `config/sources.json` and can be added or removed freely.

## Curation Standard

The AI curation is tuned for a **senior business audience** (C-suite, CTOs, investors, strategists). Stories must pass the test: *"Does a CEO care about this?"*

### Themes tracked:
- AI Workforce Impact
- Enterprise ROI
- Regulatory
- Funding & M&A
- AI Risk
- AI Strategy
- Model & Platform
- Research to Business
- Agentic AI
- AI Ethics & Trust

### Phenomena flagged as high priority:
- **Pilot Purgatory** — AI initiatives stuck in demo mode
- **The GenAI Paradox** — broad adoption, no measurable impact
- **Shadow AI** — unauthorized AI tool usage
- **Agentwashing** — basic LLM features marketed as "agentic AI"
- **Hallucination Tax** — hidden cost of AI errors at scale
- **Token Anxiety** — cost/complexity of running AI agents

## Project Structure

```
daily-updates/
├── config/
│   └── sources.json              # All source definitions
├── src/
│   ├── index.js                  # Main orchestrator
│   ├── config.js                 # Environment/config loader
│   ├── logger.js                 # Logging
│   ├── fetchers/
│   │   ├── index.js              # Fetcher coordinator
│   │   ├── rss.js                # RSS/Atom feed fetcher
│   │   ├── web.js                # Web scraper
│   │   └── search.js             # Google News / search fetcher
│   ├── curation/
│   │   └── curate.js             # Claude AI curation pipeline
│   └── output/
│       ├── local.js              # PDF + HTML + JSON output
│       ├── google-docs.js        # Google Docs output (future)
│       └── email.js              # Gmail delivery (future)
├── digests/                      # Daily output (gitignored)
├── data/                         # Intermediate data (gitignored)
├── .env.example
└── package.json
```

## Roadmap

- [x] Step 1: Daily source fetching + AI curation + local PDF output
- [ ] Step 2: Google Docs + Gmail delivery
- [ ] Step 3: Slack integration
- [ ] Step 4: Content transformation with business lens
- [ ] Step 5: Social media / newsletter generation
