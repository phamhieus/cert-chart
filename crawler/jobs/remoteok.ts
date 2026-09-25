import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://remoteok.com';
const API = `${ORIGIN}/api`;

interface RemoteOkEntry {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  description?: string;
  tags?: string[];
  date?: string;
  url?: string;
  /** The first element of the feed is a legal notice, not a posting. */
  legal?: string;
}

/**
 * Remote OK publishes its whole current board as one JSON document, so this is a
 * single request rather than a search per certification.
 *
 * Its API terms ask for a followed link back to the posting on Remote OK. The
 * dashboard satisfies that by design: every job row links to `source.url`, which
 * is the Remote OK posting, and the Data sources dialog links the board itself.
 * Keep it that way — dropping those links would breach the terms this crawler
 * relies on.
 */
export const remoteOkCrawler: JobCrawler = {
  id: 'remoteok',
  name: 'Remote OK',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.remoteok.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.remoteok;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    const feed = await fetchJson<RemoteOkEntry[]>(API, { timeoutMs: 45_000 });
    const entries = feed.filter((entry) => entry.id && entry.position);
    log(`Remote OK: ${entries.length} postings in the feed`);

    for (const entry of entries) {
      const description = stripHtml(entry.description ?? '');
      const text = `${entry.position}\n${(entry.tags ?? []).join(' ')}\n${description}`;
      const certifications = extractJobCertifications(text, aliasIndex);
      if (certifications.length === 0) continue;

      const url = entry.url ?? `${ORIGIN}/remote-jobs/${entry.slug ?? entry.id}`;
      jobs.set(url, {
        id: `remoteok_${entry.id}`,
        title: entry.position!,
        company: entry.company || 'Unknown',
        // Remote OK is a remote-only board — `entry.location`, when present, is
        // a hiring restriction ("USA Only"), not a place, so anything that
        // isn't a specific tracked market falls back to `remote`, not `global`.
        location: resolveLocation(entry.location, 'remote'),
        certifications,
        source: { name: 'Remote OK', url },
        postedAt: entry.date?.slice(0, 10) ?? crawledDate,
        crawledAt,
      });
    }

    log(`Remote OK: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
