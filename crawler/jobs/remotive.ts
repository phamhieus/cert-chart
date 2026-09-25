import * as cheerio from 'cheerio';
import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import { fetchText } from '../util/http';

const ORIGIN = 'https://remotive.com';

/**
 * Remotive's robots.txt disallows `/api/*` and every `search=` URL, so this
 * reads the public RSS feeds instead of querying per certification. The feeds
 * only carry the latest postings; the store accumulates them across runs.
 * `<location>` is a hiring restriction ("Europe", "USA"), not where the company
 * sits — it is passed through `resolveLocation` unchanged rather than interpreted.
 */
export const remotiveCrawler: JobCrawler = {
  id: 'remotive',
  name: 'Remotive',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.remotive.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.remotive;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    for (const feedUrl of settings.feeds) {
      let xml: string;
      try {
        xml = await fetchText(feedUrl, { accept: 'application/rss+xml, application/xml' });
      } catch (error) {
        log(`Remotive: ${feedUrl} failed (${(error as Error).message})`);
        continue;
      }
      const $ = cheerio.load(xml, { xmlMode: true });

      $('item').each((_, element) => {
        const item = $(element);
        const link = item.find('link').first().text().trim();
        const title = item.find('title').first().text().trim();
        if (!link || !title || jobs.has(link)) return;

        const description = stripHtml(item.find('description').first().text());
        const category = item.find('category').first().text().trim();
        const certifications = extractJobCertifications(`${title}\n${category}\n${description}`, aliasIndex);
        if (certifications.length === 0) return;

        const jobId = item.find('jobId').first().text().trim() || link.split('-').at(-1);
        const pubDate = item.find('pubDate').first().text().trim();
        const parsed = pubDate ? new Date(pubDate) : null;

        jobs.set(link, {
          id: `remotive_${jobId}`,
          title,
          company: item.find('company').first().text().trim() || 'Unknown',
          location: resolveLocation(item.find('location').first().text().trim() || 'Remote'),
          certifications,
          source: { name: 'Remotive', url: link },
          postedAt:
            parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : crawledDate,
          crawledAt,
        });
      });
    }

    log(`Remotive: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
