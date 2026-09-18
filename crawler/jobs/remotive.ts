import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://remotive.com';
const API = `${ORIGIN}/api/remote-jobs`;

interface RemotiveResponse {
  'job-count'?: number;
  jobs?: Array<{
    id?: number;
    url?: string;
    title?: string;
    company_name?: string;
    category?: string;
    tags?: string[];
    publication_date?: string;
    candidate_required_location?: string;
    description?: string;
  }>;
}

/**
 * Remotive's public API takes a search term, so this asks it once per
 * certification instead of pulling the whole board. `candidate_required_location`
 * is a hiring restriction ("Europe", "Americas"), not where the company sits —
 * it is passed through `resolveLocation` unchanged rather than interpreted.
 */
export const remotiveCrawler: JobCrawler = {
  id: 'remotive',
  name: 'Remotive',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.remotive.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.remotive;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    const terms = [...new Set(certifications.flatMap((cert) => [cert.name, cert.shortName]))];

    for (const term of terms) {
      if (jobs.size >= settings.maxRecords) break;

      const url = `${API}?search=${encodeURIComponent(term)}&limit=${settings.resultsPerTerm}`;

      let response: RemotiveResponse;
      try {
        response = await fetchJson<RemotiveResponse>(url, { timeoutMs: 30_000 });
      } catch (error) {
        log(`Remotive: "${term}" failed (${(error as Error).message})`);
        continue;
      }

      for (const job of response.jobs ?? []) {
        if (!job.id || !job.title) continue;
        const description = stripHtml(job.description ?? '');
        const text = `${job.title}\n${(job.tags ?? []).join(' ')}\n${description}`;
        // The search is fuzzy, so the posting still has to name a certification.
        const matched = extractJobCertifications(text, aliasIndex);
        if (matched.length === 0) continue;

        const jobUrl = job.url ?? `${ORIGIN}/remote-jobs/${job.id}`;
        jobs.set(jobUrl, {
          id: `remotive_${job.id}`,
          title: job.title,
          company: job.company_name || 'Unknown',
          location: resolveLocation(job.candidate_required_location || 'Remote'),
          certifications: matched,
          source: { name: 'Remotive', url: jobUrl },
          postedAt: job.publication_date?.slice(0, 10) ?? crawledDate,
          crawledAt,
        });
      }
    }

    log(`Remotive: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
