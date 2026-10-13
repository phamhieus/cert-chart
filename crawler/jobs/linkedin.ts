import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import type { CrawlContext, JobCrawler } from '../types';
import { braveApiKey, braveSearch, searchTerm } from '../util/brave';

const ORIGIN = 'https://www.linkedin.com';

/** LinkedIn's job ids are the trailing digits of `/jobs/view/{slug}-{id}`. */
const JOB_ID = /linkedin\.com\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/i;

/**
 * Search titles come in two shapes: "Acme hiring Cloud Engineer in Hanoi,
 * Vietnam | LinkedIn", which carries company and place, and a bare
 * "Cloud Engineer - Acme | LinkedIn", which carries less.
 */
function parseTitle(raw: string): { title: string; company: string; place: string | null } {
  const text = raw.replace(/\s*[|\-–]\s*LinkedIn\s*$/i, '').trim();
  const hiring = text.match(/^(.+?) hiring (.+?) in (.+)$/i);
  if (hiring) return { company: hiring[1].trim(), title: hiring[2].trim(), place: hiring[3].trim() };
  const dash = text.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (dash) return { title: dash[1].trim(), company: dash[2].trim(), place: null };
  return { title: text, company: 'Unknown', place: null };
}

/**
 * LinkedIn job postings, found through the Brave Search API rather than
 * LinkedIn itself. LinkedIn's robots.txt prohibits automated access and its
 * Jobs API is partner-only, so no linkedin.com page is ever requested: a
 * posting is the title, URL, snippet and date the search engine returns.
 *
 * That makes these records thinner than any other board's. The certification
 * is matched on the title and the snippet only, the company and place come
 * from the search title when it has the "X hiring Y in Z" shape, and the date
 * is the search engine's, falling back to the crawl date. The query is per
 * certification, so these postings are never counted towards role demand.
 */
export const linkedInCrawler: JobCrawler = {
  id: 'linkedin',
  name: 'LinkedIn',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.linkedin.enabled && braveApiKey() !== null,

  skipReason: (config) =>
    config.sources.linkedin.enabled
      ? 'Needs BRAVE_API_KEY (read through search results; robots.txt forbids crawling LinkedIn)'
      : 'Disabled in crawler/config.ts',

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.linkedin;
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();
    let results = 0;

    for (const cert of certifications.slice(0, settings.maxCertifications)) {
      if (jobs.size >= settings.maxRecords) break;

      let hits;
      try {
        hits = await braveSearch(`site:linkedin.com/jobs/view "${searchTerm(cert)}"`, settings.resultsPerCert);
      } catch (error) {
        log(`LinkedIn: search for ${cert.shortName} failed (${(error as Error).message})`);
        continue;
      }
      results += hits.length;

      for (const hit of hits) {
        const jobId = hit.url.match(JOB_ID)?.[1];
        if (!jobId || jobs.has(jobId)) continue;

        const { title, company, place } = parseTitle(hit.title);
        const certs = extractJobCertifications(`${title}\n${hit.description}`, aliasIndex);
        if (certs.length === 0) continue;

        jobs.set(jobId, {
          id: `linkedin_${jobId}`,
          title,
          company,
          // Only the title's "in Z" — a snippet names places that are not the job's.
          location: resolveLocation(place),
          certifications: certs,
          source: { name: 'LinkedIn', url: `${ORIGIN}/jobs/view/${jobId}/` },
          postedAt: hit.publishedAt ?? crawledDate,
          crawledAt,
        });
      }
    }

    log(`LinkedIn: ${jobs.size} postings of ${results} search results name a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
