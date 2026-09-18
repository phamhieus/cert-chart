import { CRAWL_CONFIG } from '../config';

const robotsCache = new Map<string, Promise<RobotsRules>>();
let lastRequestAt = 0;

interface RobotsRule {
  /** Pattern compiled from the robots path, with `*` and `$` honoured. */
  test: RegExp;
  /** Length of the raw pattern — RFC 9309 gives the longest match priority. */
  length: number;
  allow: boolean;
}

interface RobotsRules {
  rules: RobotsRule[];
  crawlDelayMs: number;
}

async function politeWait(extraMs = 0): Promise<void> {
  const wait = CRAWL_CONFIG.requestDelayMs + extraMs - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/**
 * Compiles a robots path into a regex: `*` matches any run of characters and a
 * trailing `$` anchors the end, everything else is literal. Without this,
 * patterns like `/*?q` (vieclam24h) or `/api/*` (CareerViet) silently match
 * nothing and the crawler walks into paths the site asked it to stay out of.
 */
function robotsPattern(path: string): RegExp {
  const anchored = path.endsWith('$');
  const body = anchored ? path.slice(0, -1) : path;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

function parseRobots(body: string): RobotsRules {
  const result: RobotsRules = { rules: [], crawlDelayMs: 0 };
  let appliesToUs = false;
  // Consecutive `User-agent` lines share the group of rules that follows them.
  let inUserAgentBlock = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      appliesToUs = (inUserAgentBlock && appliesToUs) || value === '*';
      inUserAgentBlock = true;
      continue;
    }

    inUserAgentBlock = false;
    if (!appliesToUs) continue;

    if ((key === 'disallow' || key === 'allow') && value) {
      result.rules.push({
        test: robotsPattern(value),
        length: value.length,
        allow: key === 'allow',
      });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) result.crawlDelayMs = seconds * 1000;
    }
  }

  return result;
}

async function robotsFor(origin: string): Promise<RobotsRules> {
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': CRAWL_CONFIG.userAgent },
      signal: AbortSignal.timeout(10_000),
    })
      .then(async (response) =>
        response.ok ? parseRobots(await response.text()) : { rules: [], crawlDelayMs: 0 },
      )
      .catch(() => ({ rules: [], crawlDelayMs: 0 }));
    robotsCache.set(origin, cached);
  }
  return cached;
}

/**
 * Checks the `User-agent: *` group, matching against path *and* query string so
 * a rule like `Disallow: /*?q` is honoured. The longest matching pattern wins
 * and `Allow` beats a `Disallow` of the same length, per RFC 9309. A blanket
 * `Disallow: /` counts — sites that ban crawlers outright (Reddit, for one) must
 * be read through their API instead.
 */
export async function isAllowed(url: string): Promise<boolean> {
  if (!CRAWL_CONFIG.respectRobotsTxt) return true;
  const target = new URL(url);
  const { rules } = await robotsFor(target.origin);
  const path = `${target.pathname}${target.search}`;

  let verdict = true;
  let strength = -1;
  for (const rule of rules) {
    if (!rule.test.test(path)) continue;
    if (rule.length > strength || (rule.length === strength && rule.allow)) {
      verdict = rule.allow;
      strength = rule.length;
    }
  }
  return verdict;
}

export class BlockedByRobots extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'BlockedByRobots';
  }
}

export interface FetchOptions {
  accept?: string;
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function request(url: string, options: FetchOptions): Promise<Response> {
  if (!(await isAllowed(url))) throw new BlockedByRobots(url);

  const origin = new URL(url).origin;
  const { crawlDelayMs } = await robotsFor(origin);
  const retries = options.retries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await politeWait(attempt * 1500 + crawlDelayMs);
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': CRAWL_CONFIG.userAgent,
          accept: options.accept ?? 'text/html,application/xhtml+xml',
          'accept-language': 'en,vi;q=0.8,ja;q=0.6',
          ...options.headers,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${response.status} ${response.statusText} for ${url}`);
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  return (await request(url, options)).text();
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await request(url, { accept: 'application/json', ...options });
  return (await response.json()) as T;
}
