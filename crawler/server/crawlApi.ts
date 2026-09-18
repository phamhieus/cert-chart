import type { IncomingMessage, ServerResponse } from 'node:http';
import { runCrawl } from '../pipeline';
import { datasetSummary } from '../store';
import type { CrawlProgress } from '../types';

const IDLE: CrawlProgress = {
  state: 'idle',
  completed: 0,
  total: 0,
  outcomes: [],
  messages: [],
};

let progress: CrawlProgress = IDLE;
let inFlight: Promise<void> | null = null;

export function crawlProgress(): CrawlProgress {
  return progress;
}

export function startCrawl(only?: string[]): CrawlProgress {
  if (inFlight) return progress;

  progress = { ...IDLE, state: 'running', startedAt: new Date().toISOString() };
  inFlight = runCrawl({
    only,
    onProgress: (next) => {
      progress = next;
    },
  })
    .then((final) => {
      progress = final;
    })
    .catch((error: unknown) => {
      progress = {
        ...progress,
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      };
    })
    .finally(() => {
      inFlight = null;
    });

  return progress;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Minimal crawl API shared by the Vite dev server and the standalone server.
 * Returns true when the request was handled.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  if (url.pathname === '/api/dataset' && req.method === 'GET') {
    sendJson(res, 200, { dataset: datasetSummary(), crawl: progress });
    return true;
  }

  if (url.pathname === '/api/crawl' && req.method === 'GET') {
    sendJson(res, 200, { dataset: datasetSummary(), crawl: progress });
    return true;
  }

  if (url.pathname === '/api/crawl' && req.method === 'POST') {
    const only = url.searchParams.get('sources')?.split(',').filter(Boolean);
    const started = startCrawl(only && only.length > 0 ? only : undefined);
    sendJson(res, started.state === 'running' ? 202 : 200, {
      dataset: datasetSummary(),
      crawl: started,
    });
    return true;
  }

  sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
  return true;
}
