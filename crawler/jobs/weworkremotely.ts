import * as cheerio from 'cheerio';
import type { Job } from '../../src/types';
import type { CrawlContext, JobCrawler } from '../types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import { fetchText } from '../util/http';

/** RSS titles arrive as "Company: Job title". */
function splitTitle(raw: string): { company: string; title: string } {
  const separator = raw.indexOf(':');
  if (separator === -1) return { company: 'Unknown', title: raw.trim() };
  return {
    company: raw.slice(0, separator).trim(),
    title: raw.slice(separator + 1).trim(),
  };
}

export const weWorkRemotelyCrawler: JobCrawler = {
  id: 'weworkremotely',
  name: 'We Work Remotely',
  url: 'https://weworkremotely.com',
  type: 'job-board',

  isEnabled: (config) => config.sources.weworkremotely.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.weworkremotely;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    for (const feedUrl of settings.feeds) {
      const xml = await fetchText(feedUrl, { accept: 'application/rss+xml, application/xml' });
      const $ = cheerio.load(xml, { xmlMode: true });

      $('item').each((_, element) => {
        const item = $(element);
        const link = item.find('link').first().text().trim();
        if (!link || jobs.has(link)) return;

        const { company, title } = splitTitle(item.find('title').first().text());
        const description = stripHtml(item.find('description').first().text());
        const certifications = extractJobCertifications(`${title}\n${description}`, aliasIndex);
        if (certifications.length === 0) return;

        const pubDate = item.find('pubDate').first().text().trim();
        const parsed = pubDate ? new Date(pubDate) : null;
        const regionText = item.find('region').first().text().trim();

        jobs.set(link, {
          id: `wwr_${link.split('/').filter(Boolean).at(-1)}`,
          title,
          company,
          // We Work Remotely is a remote-only board — `regionText` is a hiring
          // restriction ("Anywhere in the World", "USA Only"), not a place.
          location: resolveLocation(regionText, 'remote'),
          certifications,
          source: { name: 'We Work Remotely', url: link },
          postedAt:
            parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : crawledDate,
          crawledAt,
        });
      });
    }

    log(`We Work Remotely: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
