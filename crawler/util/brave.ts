import { CRAWL_CONFIG } from '../config';
import { stripHtml } from '../normalize/jobPosting';

const API = 'https://api.search.brave.com/res/v1/web/search';
/** The free plan allows one query per second; both LinkedIn crawlers share it. */
const MIN_INTERVAL_MS = 1_100;

export interface BraveResult {
  title: string;
  url: string;
  description: string;
  /** `YYYY-MM-DD` when Brave knows the page's date. */
  publishedAt: string | null;
}

interface BraveResponse {
  web?: {
    results?: Array<{ title?: string; url?: string; description?: string; page_age?: string }>;
  };
}

let lastCallAt = 0;

export function braveApiKey(): string | null {
  return process.env.BRAVE_API_KEY || null;
}

/**
 * One Brave web search. This is the search engine's own API, called with a key,
 * so it goes straight to `fetch` rather than the robots-checked helper — the
 * same reasoning as Udemy and Reddit. The pages the results point at are never
 * fetched: only the title, URL, snippet and date Brave returns are kept.
 */
export async function braveSearch(query: string, count: number): Promise<BraveResult[]> {
  const key = braveApiKey();
  if (!key) throw new Error('BRAVE_API_KEY missing');

  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();

  const params = new URLSearchParams({ q: query, count: String(Math.min(count, 20)) });
  const response = await fetch(`${API}?${params}`, {
    headers: {
      accept: 'application/json',
      'x-subscription-token': key,
      'user-agent': CRAWL_CONFIG.userAgent,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const payload = (await response.json()) as BraveResponse;
  return (payload.web?.results ?? [])
    .filter((result) => result.title && result.url)
    .map((result) => ({
      // Brave marks the matched words with <strong>.
      title: stripHtml(result.title!),
      url: result.url!.split('?')[0],
      description: stripHtml(result.description ?? ''),
      publishedAt: /^\d{4}-\d{2}-\d{2}/.test(result.page_age ?? '')
        ? result.page_age!.slice(0, 10)
        : null,
    }));
}

/** The search term for a certification: its exam code when it has one, else its short name. */
export function searchTerm(cert: { code: string | null; shortName: string }): string {
  return cert.code && cert.code.length >= 3 ? cert.code : cert.shortName;
}
