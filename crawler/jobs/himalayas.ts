import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://himalayas.app';
const API = `${ORIGIN}/jobs/api`;

interface HimalayasJob {
  /** Himalayas' own canonical URL for the posting — also its only stable id. */
  guid?: string;
  title?: string;
  companyName?: string;
  description?: string;
  excerpt?: string;
  locationRestrictions?: string[];
  categories?: string[];
  /** Unix seconds. */
  pubDate?: number;
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
  nextCursor?: string | null;
}

/**
 * Global remote-job board with a documented, cursor-paginated JSON feed and no
 * search endpoint, so this pages through the whole board like Arbeitnow.
 * `robots.txt` disallows only the paginated HTML views (`/jobs?page=`, …), not
 * this API. Added alongside Remote OK / Remotive / Arbeitnow, not instead of
 * any of them — postings barely overlap between remote-job boards.
 */
export const himalayasCrawler: JobCrawler = {
  id: 'himalayas',
  name: 'Himalayas',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.himalayas.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.himalayas;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();
    let cursor: string | undefined;
    let scanned = 0;

    for (let page = 1; page <= settings.pages; page += 1) {
      if (jobs.size >= settings.maxRecords) break;

      const url = `${API}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;

      let response: HimalayasResponse;
      try {
        response = await fetchJson<HimalayasResponse>(url, { timeoutMs: 30_000 });
      } catch (error) {
        log(`Himalayas: page ${page} failed (${(error as Error).message})`);
        break;
      }

      const entries = response.jobs ?? [];
      if (entries.length === 0) break;
      scanned += entries.length;

      for (const entry of entries) {
        if (!entry.guid || !entry.title) continue;
        const description = stripHtml(entry.description ?? entry.excerpt ?? '');
        const text = `${entry.title}\n${(entry.categories ?? []).join(' ')}\n${description}`;
        const certifications = extractJobCertifications(text, aliasIndex);
        if (certifications.length === 0) continue;

        const slug = entry.guid.replace(/^https?:\/\/[^/]+\//, '').replace(/\//g, '_');
        jobs.set(entry.guid, {
          id: `himalayas_${slug}`,
          title: entry.title,
          company: entry.companyName || 'Unknown',
          // Himalayas is a remote-only board — `locationRestrictions` states a
          // hiring restriction ("United States", "Worldwide"), not where the
          // company sits, same as Remotive's `candidate_required_location`. A
          // restriction that isn't a tracked market falls back to `remote`.
          location: resolveLocation((entry.locationRestrictions ?? []).join(', '), 'remote'),
          certifications,
          source: { name: 'Himalayas', url: entry.guid },
          postedAt: entry.pubDate ? new Date(entry.pubDate * 1000).toISOString().slice(0, 10) : crawledDate,
          crawledAt,
        });
      }

      cursor = response.nextCursor ?? undefined;
      if (!cursor) break;
    }

    log(`Himalayas: ${jobs.size} of ${scanned} scanned postings mention a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
