import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://www.greenhouse.io';
const API = 'https://boards-api.greenhouse.io/v1/boards';

interface GreenhouseJob {
  id?: number;
  title?: string;
  /** Full HTML job description — the search API has no per-term endpoint, so
   *  this is fetched once per board and matched locally instead. */
  content?: string;
  absolute_url?: string;
  updated_at?: string;
  location?: { name?: string };
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

/**
 * Job-board API used by companies on the Greenhouse ATS
 * (`boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`). One
 * request per board returns every open posting with its full description —
 * no search endpoint, no key, and `robots.txt` disallows only `/embed/`.
 *
 * `sources.greenhouse.boards` is a hand-picked list, not a discovery crawl:
 * each token was checked to resolve and return postings before being added.
 * It skews toward US-based security/infra/cloud companies, so it widens the
 * global bucket in the dashboard, not the Vietnam one — add a board only
 * after confirming `{API}/{token}/jobs` returns real jobs.
 */
export const greenhouseCrawler: JobCrawler = {
  id: 'greenhouse',
  name: 'Greenhouse',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.greenhouse.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.greenhouse;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();
    let scanned = 0;

    for (const board of settings.boards) {
      if (jobs.size >= settings.maxRecords) break;

      let response: GreenhouseResponse;
      try {
        response = await fetchJson<GreenhouseResponse>(`${API}/${board.token}/jobs?content=true`, {
          timeoutMs: 45_000,
        });
      } catch (error) {
        log(`Greenhouse: ${board.company} failed (${(error as Error).message})`);
        continue;
      }

      const entries = response.jobs ?? [];
      scanned += entries.length;

      for (const entry of entries) {
        if (!entry.id || !entry.title) continue;
        const description = stripHtml(entry.content ?? '');
        const certifications = extractJobCertifications(`${entry.title}\n${description}`, aliasIndex);
        if (certifications.length === 0) continue;

        const url = entry.absolute_url ?? `https://boards.greenhouse.io/${board.token}/jobs/${entry.id}`;
        jobs.set(url, {
          id: `greenhouse_${board.token}_${entry.id}`,
          title: entry.title,
          company: board.company,
          location: resolveLocation(entry.location?.name ?? ''),
          certifications,
          source: { name: 'Greenhouse', url },
          postedAt: entry.updated_at?.slice(0, 10) ?? crawledDate,
          crawledAt,
        });
      }
    }

    log(
      `Greenhouse: ${jobs.size} of ${scanned} scanned postings across ${settings.boards.length} boards mention a tracked certification`,
    );
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
