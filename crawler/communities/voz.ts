import * as cheerio from 'cheerio';
import type { CommunityPost } from '../../src/types';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { marketLocation } from '../normalize/location';
import { fetchText } from '../util/http';

const ORIGIN = 'https://voz.vn';

function parseCount(raw: string): number {
  const text = raw.replace(/[,.]/g, '').trim().toUpperCase();
  const match = /^(\d+(?:\.\d+)?)([KM])?$/.exec(text);
  if (!match) return 0;
  const value = Number(match[1]);
  const factor = match[2] === 'M' ? 1_000_000 : match[2] === 'K' ? 1000 : 1;
  return Math.round(value * factor);
}

/**
 * VOZ (XenForo) has no public search API, so this scans the forum listing pages
 * configured in `crawler/config.ts`: thread titles, reply and view counts are
 * public there. Threads are attributed to Vietnam market-wide — never to a city,
 * because the forum does not state where posters are.
 */
export const vozCrawler: CommunityCrawler = {
  id: 'voz',
  name: 'VOZ',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.voz.enabled && config.sources.voz.forumUrls.length > 0,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.voz;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();

    for (const forumUrl of settings.forumUrls) {
      const html = await fetchText(forumUrl);
      const $ = cheerio.load(html);

      $('.structItem--thread').each((_, element) => {
        const row = $(element);
        const link = row.find('.structItem-title a').last();
        const title = link.text().trim();
        const href = link.attr('href');
        if (!title || !href) return;

        const mentionsByCert = countCertificationMentions(title, aliasIndex);
        if (mentionsByCert.size === 0) return;

        const replies = parseCount(
          row.find('.structItem-cell--meta dl').first().find('dd').text(),
        );
        const views = parseCount(row.find('.structItem-cell--meta dl').last().find('dd').text());
        const published = row.find('time').first().attr('datetime');
        const threadId = /\.(\d+)/.exec(href)?.[1] ?? href;

        for (const [certificationId, mentions] of mentionsByCert) {
          const id = `voz_${threadId}_${certificationId}`;
          posts.set(id, {
            id,
            certificationId,
            source: { name: 'VOZ', url: new URL(href, ORIGIN).toString() },
            title,
            location: marketLocation('vietnam'),
            mentions,
            comments: replies,
            views: views || null,
            reactions: null,
            uniqueAuthors: null,
            publishedAt: published ? published.slice(0, 10) : crawledDate,
            crawledAt,
          });
        }
      });
    }

    log(`VOZ: ${posts.size} threads matched a tracked certification`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
