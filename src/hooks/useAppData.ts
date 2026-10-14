import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CrawlApiUnavailable,
  fetchCrawlStatus,
  startCrawl as requestCrawl,
} from '../services/crawlApi';
import { invalidateDataset, loadDataset, type Dataset } from '../services/dataRepository';
import type { CrawlProgress } from '../types';

export type AppPhase = 'loading' | 'crawling' | 'ready' | 'empty' | 'error';

interface AppData {
  phase: AppPhase;
  dataset: Dataset | null;
  progress: CrawlProgress | null;
  /** True when no crawl API is reachable (static hosting) — the CLI must be used. */
  crawlUnavailable: boolean;
  error: string | null;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 1500;

function hasEvidence(dataset: Dataset): boolean {
  return dataset.jobs.length > 0 || dataset.community.length > 0;
}

/**
 * Loads the dataset and, when it is still empty, asks the local crawl API to fill
 * it while reporting progress. A finished crawl re-reads the JSON files in place.
 */
export function useAppData(): AppData {
  const [phase, setPhase] = useState<AppPhase>('loading');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [crawlUnavailable, setCrawlUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const reloadDataset = useCallback(async (): Promise<Dataset | null> => {
    invalidateDataset();
    try {
      const next = await loadDataset();
      setDataset(next);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('error');
      return null;
    }
  }, []);

  const poll = useCallback(() => {
    stopPolling();
    pollTimer.current = window.setTimeout(async () => {
      try {
        const status = await fetchCrawlStatus();
        setProgress(status.crawl);

        if (status.crawl.state === 'running') {
          poll();
          return;
        }

        const next = await reloadDataset();
        if (status.crawl.state === 'failed') {
          setError(status.crawl.error ?? 'The crawl failed.');
          setPhase(next && hasEvidence(next) ? 'ready' : 'error');
          return;
        }
        setPhase(next && hasEvidence(next) ? 'ready' : 'empty');
      } catch (cause) {
        if (cause instanceof CrawlApiUnavailable) {
          setCrawlUnavailable(true);
          setPhase('empty');
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase('error');
      }
    }, POLL_INTERVAL_MS);
  }, [reloadDataset, stopPolling]);

  const beginCrawl = useCallback(async () => {
    setError(null);
    try {
      const status = await requestCrawl();
      setProgress(status.crawl);
      setPhase('crawling');
      poll();
    } catch (cause) {
      if (cause instanceof CrawlApiUnavailable) {
        setCrawlUnavailable(true);
        setPhase((current) => (current === 'ready' ? 'ready' : 'empty'));
        return;
      }
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase('error');
    }
  }, [poll]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let loaded: Dataset | null = null;
      try {
        loaded = await loadDataset();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setPhase('error');
        }
        return;
      }
      if (cancelled) return;
      setDataset(loaded);

      if (hasEvidence(loaded)) {
        setPhase('ready');
        return;
      }

      // No evidence yet: attach to a running crawl, or start one.
      try {
        const status = await fetchCrawlStatus();
        if (cancelled) return;
        setProgress(status.crawl);
        if (status.crawl.state === 'running') {
          setPhase('crawling');
          poll();
          return;
        }
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof CrawlApiUnavailable) {
          setCrawlUnavailable(true);
          setPhase('empty');
          return;
        }
      }

      if (!cancelled) await beginCrawl();
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [beginCrawl, poll, stopPolling]);

  const refresh = useCallback(() => {
    void beginCrawl();
  }, [beginCrawl]);

  return { phase, dataset, progress, crawlUnavailable, error, refresh };
}
