import type { Job } from '../../src/types';
import type { CrawlContext, JobCrawler } from '../types';
import { extractJobCertifications } from '../normalize/certifications';
import { stripHtml } from '../normalize/jobPosting';
import { fetchJson } from '../util/http';

const API = 'https://api.mycareersfuture.gov.sg/v2';

interface SearchResult {
  total?: number;
  results?: Array<{
    uuid?: string;
    title?: string;
    postedCompany?: { name?: string } | null;
    hiringCompany?: { name?: string } | null;
    metadata?: { newPostingDate?: string; jobDetailsUrl?: string };
  }>;
}

interface JobDetail {
  uuid?: string;
  title?: string;
  description?: string;
  postedCompany?: { name?: string } | null;
  hiringCompany?: { name?: string } | null;
  address?: { districts?: Array<{ location?: string }>; isOverseas?: boolean } | null;
  metadata?: { newPostingDate?: string; jobDetailsUrl?: string };
}

async function search(term: string, limit: number, userAgent: string): Promise<SearchResult> {
  const response = await fetch(`${API}/search?limit=${limit}&page=0`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': userAgent,
    },
    body: JSON.stringify({
      search: term,
      limit,
      page: 0,
      sessionId: '',
      sortBy: ['new_posting_date'],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`MyCareersFuture search ${response.status} for "${term}"`);
  return (await response.json()) as SearchResult;
}

/**
 * Singapore's government job portal. robots.txt allows crawling and the search
 * API is public; job descriptions come from the per-job endpoint.
 */
export const myCareersFutureCrawler: JobCrawler = {
  id: 'mycareersfuture',
  name: 'MyCareersFuture',
  url: 'https://www.mycareersfuture.gov.sg',
  type: 'job-board',

  isEnabled: (config) => config.sources.mycareersfuture.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.mycareersfuture;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    for (const cert of certifications) {
      // Exam codes and short names are specific enough to avoid matching
      // unrelated postings ("AWS" alone means Annual Wage Supplement here).
      const terms = [cert.code, cert.shortName]
        .filter((term): term is string => typeof term === 'string' && term.length >= 4)
        .slice(0, 2);

      const candidates = new Map<string, string>();
      for (const term of terms) {
        try {
          const result = await search(term, settings.resultsPerCert, config.userAgent);
          for (const item of result.results ?? []) {
            if (item.uuid) candidates.set(item.uuid, item.metadata?.jobDetailsUrl ?? '');
          }
        } catch (error) {
          log(`MyCareersFuture: search "${term}" failed (${(error as Error).message})`);
        }
      }

      let checked = 0;
      for (const [uuid, detailsUrl] of candidates) {
        if (checked >= settings.detailsPerCert) break;
        checked += 1;
        if (jobs.has(uuid)) continue;

        let detail: JobDetail;
        try {
          detail = await fetchJson<JobDetail>(`${API}/jobs/${uuid}`);
        } catch (error) {
          log(`MyCareersFuture: job ${uuid} failed (${(error as Error).message})`);
          continue;
        }

        const title = detail.title ?? '';
        const description = stripHtml(detail.description ?? '');
        const certifications = extractJobCertifications(`${title}\n${description}`, aliasIndex);
        if (certifications.length === 0) continue;

        const company =
          detail.postedCompany?.name ?? detail.hiringCompany?.name ?? 'Undisclosed company';

        jobs.set(uuid, {
          id: `mcf_${uuid}`,
          title,
          company,
          location: { country: 'SG', market: 'singapore', city: 'Singapore' },
          certifications,
          source: {
            name: 'MyCareersFuture',
            url:
              detail.metadata?.jobDetailsUrl ||
              detailsUrl ||
              `https://www.mycareersfuture.gov.sg/job/${uuid}`,
          },
          postedAt: detail.metadata?.newPostingDate ?? crawledDate,
          crawledAt,
        });
      }

      if (jobs.size >= settings.maxRecords) break;
    }

    log(`MyCareersFuture: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
