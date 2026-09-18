import type { CrawlProgress, DatasetSummary } from '../types';

export interface CrawlStatus {
  dataset: DatasetSummary;
  crawl: CrawlProgress;
}

/** Thrown when no crawl API is reachable — e.g. the app is served as static files. */
export class CrawlApiUnavailable extends Error {
  constructor() {
    super('Crawl API not available');
    this.name = 'CrawlApiUnavailable';
  }
}

async function call(path: string, method: 'GET' | 'POST'): Promise<CrawlStatus> {
  let response: Response;
  try {
    response = await fetch(path, { method, headers: { accept: 'application/json' } });
  } catch {
    throw new CrawlApiUnavailable();
  }

  if (response.status === 404 || !response.headers.get('content-type')?.includes('json')) {
    throw new CrawlApiUnavailable();
  }
  if (!response.ok && response.status !== 202) {
    throw new Error(`Crawl API error ${response.status}`);
  }

  return (await response.json()) as CrawlStatus;
}

export function fetchCrawlStatus(): Promise<CrawlStatus> {
  return call('/api/crawl', 'GET');
}

export function startCrawl(sources?: string[]): Promise<CrawlStatus> {
  const query = sources?.length ? `?sources=${encodeURIComponent(sources.join(','))}` : '';
  return call(`/api/crawl${query}`, 'POST');
}
