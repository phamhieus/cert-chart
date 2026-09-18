import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { extractLdJsonBlocks, parseJobPostingLd } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchText } from '../util/http';
import { collectSitemapEntries } from '../util/sitemap';

const ORIGIN = 'https://www.tokyodev.com';
const SITEMAP = `${ORIGIN}/sitemap.xml`;
const JOB_PATH = /\/companies\/[^/]+\/jobs\/[^/]+$/;

/**
 * Japan's job coverage used to be empty: the big Japanese boards refuse
 * non-browser requests, so the dashboard had Japanese community activity and no
 * Japanese demand to weigh it against. TokyoDev fills that in — an
 * English-language board for engineering roles in Japan, whose robots.txt allows
 * crawling and whose job pages ship schema.org JobPosting.
 */
export const tokyoDevCrawler: JobCrawler = {
  id: 'tokyodev',
  name: 'TokyoDev',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.tokyodev.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.tokyodev;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    const entries = await collectSitemapEntries(SITEMAP, {
      maxFiles: 4,
      maxEntries: settings.maxDetailPages,
      keep: (url) => JOB_PATH.test(new URL(url).pathname),
    });

    log(`TokyoDev: ${entries.length} job pages in the sitemap`);

    for (const entry of entries) {
      let html: string;
      try {
        html = await fetchText(entry.url, { timeoutMs: 40_000, retries: 1 });
      } catch (error) {
        log(`TokyoDev: failed ${entry.url} (${(error as Error).message})`);
        continue;
      }

      const structured = parseJobPostingLd(extractLdJsonBlocks(html));
      if (!structured?.title) continue;

      const certifications = extractJobCertifications(
        `${structured.title}\n${structured.description}`,
        aliasIndex,
      );
      if (certifications.length === 0) continue;

      const slug = new URL(entry.url).pathname.split('/').filter(Boolean).join('_');
      jobs.set(entry.url, {
        id: `tokyodev_${slug}`,
        title: structured.title,
        company: structured.company || 'Unknown',
        // Every posting on this board is a role in Japan.
        location: resolveLocation(structured.location || 'Japan'),
        certifications,
        source: { name: 'TokyoDev', url: entry.url },
        postedAt: structured.datePosted ?? crawledDate,
        crawledAt,
      });
    }

    log(`TokyoDev: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
