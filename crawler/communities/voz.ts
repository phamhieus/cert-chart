import * as cheerio from 'cheerio';
import type { CommunityPost } from '../../src/types';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { stripHtml } from '../normalize/jobPosting';
import { marketLocation } from '../normalize/location';
import { fetchText } from '../util/http';

const ORIGIN = 'https://voz.vn';

/**
 * Vietnam's largest tech forum, and the one place Vietnamese IT people actually
 * discuss certifications — the rest of the Vietnamese sources here are either
 * beginner-programming (Dạy Nhau Học) or consumer-tech (Tinh tế) and name a
 * certification almost never.
 *
 * Read through each forum's RSS feed rather than its listing pages: VOZ puts
 * the HTML behind a Cloudflare challenge that answers 403 to `fetch`, but
 * `/f/{forum}/index.rss` is served normally, so no browser and no working
 * around the challenge is needed. `robots.txt` allows `/f/`; it disallows
 * `/search/` and `/posts/`, neither of which this touches.
 *
 * The feed carries the opening post in `content:encoded`, so a thread counts
 * when the certification is named in the body and not only in the title. What
 * it does not carry is the replies, so a certification mentioned purely in a
 * discussion further down is missed — reading those needs the thread page,
 * which is exactly what Cloudflare blocks.
 *
 * Each feed is the 20 newest threads, so coverage builds run by run rather
 * than in one pass. Threads are attributed to Vietnam market-wide, never to a
 * city: the forum does not state where posters are.
 */
export const vozCrawler: CommunityCrawler = {
  id: 'voz',
  name: 'VOZ',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.voz.enabled && config.sources.voz.forums.length > 0,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.voz;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();
    let scanned = 0;

    for (const forum of settings.forums) {
      let xml: string;
      try {
        xml = await fetchText(`${ORIGIN}/f/${forum}/index.rss`, {
          accept: 'application/rss+xml, application/xml',
        });
      } catch (error) {
        log(`VOZ: forum "${forum}" failed (${(error as Error).message})`);
        continue;
      }

      const $ = cheerio.load(xml, { xmlMode: true });

      $('item').each((_, element) => {
        const item = $(element);
        const title = item.find('title').first().text().trim();
        // `link` carries RSS tracking parameters; the thread URL is what gets stored.
        const link = item.find('link').first().text().trim().split('?')[0];
        if (!title || !link) return;
        scanned += 1;

        const body = stripHtml(item.find('content\\:encoded').first().text());
        const mentionsByCert = countCertificationMentions(`${title}\n${body}`, aliasIndex);
        if (mentionsByCert.size === 0) return;

        // `guid` is the thread id; the slug in the URL changes when a thread is renamed.
        const threadId = item.find('guid').first().text().trim() || link;
        const published = item.find('pubDate').first().text().trim();
        const parsed = published ? new Date(published) : null;

        for (const [certificationId, mentions] of mentionsByCert) {
          const id = `voz_${threadId}_${certificationId}`;
          posts.set(id, {
            id,
            certificationId,
            source: { name: 'VOZ', url: link },
            title,
            location: marketLocation('vietnam'),
            mentions,
            // The feed states no reply, view or reaction count — left null
            // rather than guessed. `comments` is a count, so 0 is the honest
            // "not stated" here, matching the other RSS-only sources.
            comments: 0,
            views: null,
            reactions: null,
            uniqueAuthors: null,
            publishedAt:
              parsed && !Number.isNaN(parsed.getTime())
                ? parsed.toISOString().slice(0, 10)
                : crawledDate,
            crawledAt,
          });
        }
      });
    }

    log(
      `VOZ: ${posts.size} of ${scanned} threads across ${settings.forums.length} forums name a tracked certification`,
    );
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
