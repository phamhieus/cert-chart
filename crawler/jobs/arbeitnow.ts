import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://www.arbeitnow.com';
const API = `${ORIGIN}/api/job-board-api`;

interface ArbeitnowResponse {
  data?: Array<{
    slug?: string;
    company_name?: string;
    title?: string;
    description?: string;
    remote?: boolean;
    url?: string;
    tags?: string[];
    job_types?: string[];
    location?: string;
    /** Unix seconds. */
    created_at?: number;
  }>;
  links?: { next?: string | null };
}

/**
 * Arbeitnow's board is mostly Germany and the wider EU — the first source here
 * covering European demand. Its API has no search, so this pages through the
 * feed and keeps the postings that name a certification. German city names fall
 * through `resolveLocation` to the global bucket rather than being invented into
 * a market the dashboard does not track.
 */
export const arbeitnowCrawler: JobCrawler = {
  id: 'arbeitnow',
  name: 'Arbeitnow',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.arbeitnow.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.arbeitnow;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();
    let scanned = 0;

    for (let page = 1; page <= settings.pages; page += 1) {
      if (jobs.size >= settings.maxRecords) break;

      let response: ArbeitnowResponse;
      try {
        response = await fetchJson<ArbeitnowResponse>(`${API}?page=${page}`, { timeoutMs: 45_000 });
      } catch (error) {
        log(`Arbeitnow: page ${page} failed (${(error as Error).message})`);
        break;
      }

      const entries = response.data ?? [];
      if (entries.length === 0) break;
      scanned += entries.length;

      for (const entry of entries) {
        if (!entry.slug || !entry.title) continue;
        const description = stripHtml(entry.description ?? '');
        const text = `${entry.title}\n${(entry.tags ?? []).join(' ')}\n${description}`;
        const certifications = extractJobCertifications(text, aliasIndex);
        if (certifications.length === 0) continue;

        const url = entry.url ?? `${ORIGIN}/jobs/${entry.slug}`;
        jobs.set(url, {
          id: `arbeitnow_${entry.slug}`,
          title: entry.title,
          company: entry.company_name || 'Unknown',
          location: resolveLocation(entry.remote ? 'Remote' : (entry.location ?? '')),
          certifications,
          source: { name: 'Arbeitnow', url },
          postedAt: entry.created_at
            ? new Date(entry.created_at * 1000).toISOString().slice(0, 10)
            : crawledDate,
          crawledAt,
        });
      }
    }

    log(
      `Arbeitnow: ${jobs.size} of ${scanned} scanned postings mention a tracked certification`,
    );
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
