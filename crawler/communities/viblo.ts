import * as cheerio from 'cheerio';
import type { CommunityPost } from '../../src/types';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { marketLocation } from '../normalize/location';
import { stripHtml } from '../normalize/jobPosting';
import { fetchText } from '../util/http';

const ORIGIN = 'https://viblo.asia';

/**
 * Vietnamese developer publishing platform. `/search`, `*.json` and `*.xml` are
 * disallowed by robots.txt, so this reads the `.rss` feeds: "newest" plus one
 * per configured tag. The newest feed only spans a day or so; the tag feeds
 * carry each tag's latest ~40 posts, and the store accumulates across runs.
 * Articles are attributed to Vietnam market-wide, never to a city.
 */
export const vibloCrawler: CommunityCrawler = {
  id: 'viblo',
  name: 'Viblo',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.viblo.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.viblo;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();

    const feeds = [`${ORIGIN}/rss`, ...settings.tags.map((tag) => `${ORIGIN}/rss/tags/${tag}.rss`)];

    for (const feedUrl of feeds) {
      let xml: string;
      try {
        xml = await fetchText(feedUrl, { accept: 'application/rss+xml, application/xml' });
      } catch (error) {
        log(`Viblo: ${feedUrl} failed (${(error as Error).message})`);
        continue;
      }
      const $ = cheerio.load(xml, { xmlMode: true });

      $('item').each((_, element) => {
        const item = $(element);
        const link = item.find('link').first().text().trim();
        const title = item.find('title').first().text().trim();
        if (!link || !title) return;

        const summary = stripHtml(item.find('description').first().text());
        const mentionsByCert = countCertificationMentions(`${title}\n${summary}`, aliasIndex);
        if (mentionsByCert.size === 0) return;

        const published = item.find('pubDate').first().text().trim().slice(0, 10);
        const slug = link.split('/').filter(Boolean).at(-1) ?? link;

        for (const [certificationId, mentions] of mentionsByCert) {
          const id = `viblo_${slug}_${certificationId}`;
          posts.set(id, {
            id,
            certificationId,
            source: { name: 'Viblo', url: link },
            title,
            location: marketLocation('vietnam'),
            mentions,
            comments: 0,
            views: null,
            reactions: null,
            uniqueAuthors: null,
            publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : crawledDate,
            crawledAt,
          });
        }
      });
    }

    log(`Viblo: ${posts.size} articles matched a tracked certification`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
