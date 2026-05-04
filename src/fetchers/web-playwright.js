import { chromium } from "playwright";
import pLimit from "p-limit";
import { logger } from "../logger.js";

const limit = pLimit(2);

async function scrapeWithBrowser(source, browser) {
  const page = await browser.newPage();
  try {
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for content to render
    await page.waitForTimeout(3000);

    const articles = await page.evaluate((sourceName) => {
      const results = [];
      const seen = new Set();
      const baseUrl = window.location.origin;

      // Look for article-like elements
      const selectors = [
        "article",
        '[class*="card"]',
        '[class*="post"]',
        '[class*="article"]',
        '[class*="story"]',
        '[class*="item"]',
        ".promo",
      ];

      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          const link = el.querySelector("a");
          if (!link) continue;

          let href = link.getAttribute("href") || "";
          const heading = el.querySelector("h1, h2, h3, h4");
          const title = heading?.textContent?.trim() || link.textContent?.trim();

          if (!title || title.length < 15 || title.length > 300) continue;
          if (!href) continue;

          if (href.startsWith("/")) href = baseUrl + href;
          if (!href.startsWith("http")) continue;
          if (seen.has(href)) continue;
          seen.add(href);

          const snippet = el.querySelector("p")?.textContent?.trim()?.slice(0, 500) || "";

          results.push({
            title,
            url: href,
            source: sourceName,
            publishedAt: new Date().toISOString(),
            snippet,
            tier: 2,
          });
        }
        if (results.length >= 15) break;
      }

      return results.slice(0, 15);
    }, source.name);

    logger.info(`${source.name}: ${articles.length} items (Playwright)`);
    return articles;
  } catch (err) {
    logger.warn(`${source.name}: failed — ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

export async function fetchPlaywrightSources(sources) {
  if (!sources || sources.length === 0) return [];

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const results = await Promise.allSettled(
      sources.map((source) =>
        limit(() => scrapeWithBrowser(source, browser))
      )
    );

    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  } catch (err) {
    logger.warn(`Playwright browser launch failed — ${err.message}`);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}
