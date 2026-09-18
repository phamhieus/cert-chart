import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { extractLdJsonBlocks, parseJobPostingLd } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchText } from '../util/http';
import { collectSitemapEntries } from '../util/sitemap';

const ORIGIN = 'https://vieclam24h.vn';
const SITEMAP = `${ORIGIN}/file/sitemap/sitemap-index.xml`;

/** `https://vieclam24h.vn/it-phan-mem/<slug>-c9p122id200364669.html` → `200364669`. */
function postingId(url: string): string | null {
  const match = /id(\d+)\.html$/.exec(new URL(url).pathname);
  return match ? match[1] : null;
}

/** The first path segment is the occupation the board filed the posting under. */
function occupationOf(url: string): string {
  return new URL(url).pathname.split('/').filter(Boolean)[0] ?? '';
}

/**
 * Vieclam24h renders its search results client-side and its robots.txt blocks
 * every `?q=` URL, so searching is out. The sitemap is the way in: it publishes
 * every posting with the occupation in the slug, and each detail page ships a
 * full schema.org JobPosting server-side. Filtering the sitemap down to the IT
 * occupations first is what keeps this inside a rate limit — one file alone
 * holds 4,180 postings, of which 87 are IT.
 */
export const vieclam24hCrawler: JobCrawler = {
  id: 'vieclam24h',
  name: 'Vieclam24h',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.vieclam24h.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.vieclam24h;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    const occupations = new Set(settings.occupations);
    const entries = await collectSitemapEntries(SITEMAP, {
      maxFiles: settings.sitemapFiles,
      maxEntries: settings.maxDetailPages,
      keepFile: (url) => url.includes('/job-') || url.includes('/tintuyendung-'),
      keep: (url) => occupations.has(occupationOf(url)),
      onProgress: (message) => log(`Vieclam24h: ${message}`),
    });

    log(`Vieclam24h: ${entries.length} IT postings selected from the sitemap`);

    for (const entry of entries) {
      const id = postingId(entry.url);
      if (!id) continue;

      let html: string;
      try {
        html = await fetchText(entry.url, { timeoutMs: 45_000, retries: 1 });
      } catch (error) {
        log(`Vieclam24h: failed ${entry.url} (${(error as Error).message})`);
        continue;
      }

      const structured = parseJobPostingLd(extractLdJsonBlocks(html));
      if (!structured?.title) continue;

      const certifications = extractJobCertifications(
        `${structured.title}\n${structured.description}`,
        aliasIndex,
      );
      if (certifications.length === 0) continue;

      jobs.set(entry.url, {
        id: `vieclam24h_${id}`,
        title: structured.title,
        company: structured.company || 'Unknown',
        location: resolveLocation(structured.location || 'Vietnam'),
        certifications,
        source: { name: 'Vieclam24h', url: entry.url },
        postedAt: structured.datePosted ?? crawledDate,
        crawledAt,
      });
    }

    log(`Vieclam24h: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
