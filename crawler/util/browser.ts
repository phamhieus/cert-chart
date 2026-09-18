import { CRAWL_CONFIG } from '../config';
import { BlockedByRobots, isAllowed } from './http';

/**
 * A browser UA, not the research UA the HTTP crawlers send. TopCV and CareerViet
 * put every page behind a Cloudflare challenge that a plain client cannot solve,
 * and the challenge script also refuses a headless UA string. Both sites allow
 * these paths in robots.txt — `isAllowed` is still checked before every
 * navigation — so what the browser gets past is the bot check, not a crawl ban.
 */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface BrowserSession {
  /** Navigates and returns the rendered HTML once the page settles. */
  open(url: string, waitForSelector?: string): Promise<string>;
}

export interface BrowserOptions {
  /**
   * Minimum gap between navigations. TopCV starts serving "Attention Required"
   * after a few quick page loads, so its crawler asks for several seconds here —
   * well above the HTTP crawlers' delay.
   */
  minDelayMs?: number;
  /** How long to settle after `domcontentloaded` before reading the DOM. */
  settleMs?: number;
}

/** Cloudflare's interstitials, which come back with a 200 and no content. */
export class ChallengedError extends Error {
  constructor(url: string) {
    super(`blocked by a bot check at ${url}`);
    this.name = 'ChallengedError';
  }
}

function isChallenge(html: string, title: string): boolean {
  return (
    title.includes('Just a moment') ||
    title.includes('Attention Required') ||
    html.includes('cf-browser-verification') ||
    html.includes('/cdn-cgi/challenge-platform/')
  );
}

type PlaywrightModule = typeof import('playwright');

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    return (await import('playwright')) as PlaywrightModule;
  } catch {
    return null;
  }
}

/** True when both the package and a downloaded browser binary are present. */
export async function isBrowserAvailable(): Promise<boolean> {
  const playwright = await loadPlaywright();
  if (!playwright) return false;
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

export const BROWSER_SETUP_HINT =
  'Needs Playwright: run `npm install` then `npx playwright install chromium`';

/**
 * Runs `work` against one headless Chromium, closing it even when the crawler
 * throws. Images, fonts and media are blocked: a job board ships megabytes of
 * them per page and none of it carries the posting text.
 */
export async function withBrowser<T>(
  work: (session: BrowserSession) => Promise<T>,
  options: BrowserOptions = {},
): Promise<T> {
  const playwright = await loadPlaywright();
  if (!playwright) throw new Error(BROWSER_SETUP_HINT);

  const minDelayMs = options.minDelayMs ?? CRAWL_CONFIG.requestDelayMs;
  const settleMs = options.settleMs ?? 0;

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      userAgent: BROWSER_USER_AGENT,
      locale: 'vi-VN',
      viewport: { width: 1366, height: 900 },
    });

    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font' || type === 'media') return route.abort();
      return route.continue();
    });

    const page = await context.newPage();
    let lastNavigationAt = 0;

    const session: BrowserSession = {
      async open(url, waitForSelector) {
        if (!(await isAllowed(url))) throw new BlockedByRobots(url);

        // Two attempts: a bot check that appears mid-run usually clears if the
        // crawler simply slows down instead of retrying at the same pace.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const wait = minDelayMs * (attempt + 1) - (Date.now() - lastNavigationAt);
          if (wait > 0) await page.waitForTimeout(wait);

          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          if (waitForSelector) {
            // A missing selector just means this page had no results, which is
            // not an error — only a challenge is.
            await page.waitForSelector(waitForSelector, { timeout: 25_000 }).catch(() => null);
          }
          if (settleMs > 0) await page.waitForTimeout(settleMs);
          lastNavigationAt = Date.now();

          const html = await page.content();
          if (!isChallenge(html, await page.title())) return html;
        }

        throw new ChallengedError(url);
      },
    };

    return await work(session);
  } finally {
    await browser.close();
  }
}
