import * as cheerio from 'cheerio';
import type { CommunityPost } from '../../src/types';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { stripHtml } from '../normalize/jobPosting';
import { marketLocation } from '../normalize/location';
import { fetchText } from '../util/http';

const ORIGIN = 'https://quantrimang.com';

/** `"datePublished": "2026-01-22T08:03:18+07:00"` from the article's JSON-LD. */
function publishedDate(html: string): string | null {
  const match = /"datePublished"\s*:\s*"([^"]{10,})"/.exec(html);
  return match ? match[1].slice(0, 10) : null;
}

/**
 * Vietnamese IT publication. `robots.txt` is a bare `Allow: /`, and `/s/?q=`
 * is the site's own search: "cisco" returns 196 articles, "security" 362,
 * "ccna" 39, "pmp" 54.
 *
 * That search only accepts a single alphanumeric token — "AWS SAA", "AZ-104"
 * and "Terraform Associate" all answer 400 — so it is asked for vendor and
 * technology words instead of exam names, and the alias check does the rest.
 * That is the same shape as the GitHub and Stack Exchange crawlers: a broad
 * search, then proof that the certification is really named.
 *
 * Worth knowing before reading the numbers: this is an editorial site, not a
 * forum. Its articles are staff-written how-tos ("Kiến thức cần có để lấy
 * chứng chỉ CCNA của Cisco"), closer to dev.to's articles than to a VOZ
 * thread, and they are counted the same way — an article is kept only when a
 * tracked certification is actually named in its title or summary, never
 * because the search engine ranked it for the term. Search drops "+" (a query
 * for "Security+" comes back as "security"), which is precisely why the
 * alias check runs again on what comes back.
 *
 * The search results carry no date, so the publish date is read from each
 * article's own JSON-LD — capped by `maxArticlePages`, because that is one
 * request per article. An article whose date cannot be read is dropped rather
 * than dated to the crawl, which would pile the whole archive into this month
 * and invent a spike in the trend series.
 *
 * Its archive is deep and old — most of its CCNA and CCNP material was written
 * between 2006 and 2012 — so `historyYears` is applied here as it is to every
 * other community source. A 2006 article is a real article, but it is not
 * evidence of community activity now, and counting it as such would inflate
 * exactly the certifications with the longest paper trail.
 */
export const quanTriMangCrawler: CommunityCrawler = {
  id: 'quantrimang',
  name: 'Quản Trị Mạng',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.quantrimang.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.quantrimang;
    const crawledAt = now.toISOString();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    let tooOld = 0;
    const posts = new Map<string, CommunityPost>();
    // path → { title, summary, certs } for everything the search turned up.
    const candidates = new Map<string, { title: string; summary: string; hits: Map<string, number> }>();

    for (const term of settings.searchTerms) {
      if (candidates.size >= settings.maxRecords) break;

      let html: string;
      try {
        html = await fetchText(`${ORIGIN}/s/?q=${encodeURIComponent(term)}`, { timeoutMs: 30_000 });
      } catch (error) {
        // A term the search will not take answers 400; nothing to report.
        log(`Quản Trị Mạng: "${term}" returned nothing (${(error as Error).message})`);
        continue;
      }

      const $ = cheerio.load(html);

      $('.listview li.listitem').each((_, element) => {
        const row = $(element);
        const link = row.find('h3 a.title').first();
        const path = link.attr('href');
        const title = link.text().trim();
        if (!path || !title || candidates.has(path)) return;

        const summary = row.find('.desc').first().text().trim();
        // The search is fuzzy, so the article still has to name a certification.
        const hits = countCertificationMentions(`${title}\n${summary}`, aliasIndex);
        if (hits.size === 0) return;

        candidates.set(path, { title, summary, hits });
      });
    }

    log(`Quản Trị Mạng: ${candidates.size} articles name a tracked certification`);

    let read = 0;
    for (const [path, article] of candidates) {
      if (read >= settings.maxArticlePages || posts.size >= settings.maxRecords) break;

      const url = new URL(path, ORIGIN).toString();
      let html: string;
      try {
        html = await fetchText(url, { timeoutMs: 30_000, retries: 1 });
      } catch (error) {
        log(`Quản Trị Mạng: ${path} unreadable (${(error as Error).message})`);
        continue;
      }
      read += 1;

      const publishedAt = publishedDate(html);
      if (!publishedAt) {
        log(`Quản Trị Mạng: ${path} states no publish date — skipped`);
        continue;
      }
      if (publishedAt < cutoffDate) {
        tooOld += 1;
        continue;
      }

      // The article body counts too: a how-to that names the exam only in its
      // steps is still about that exam.
      const body = stripHtml(cheerio.load(html)('article, .content-news, #contentDetail').text());
      const hits = countCertificationMentions(
        `${article.title}\n${article.summary}\n${body}`,
        aliasIndex,
      );

      for (const [certificationId, mentions] of hits.size > 0 ? hits : article.hits) {
        const id = `qtm_${path.split('-').at(-1) ?? path}_${certificationId}`;
        posts.set(id, {
          id,
          certificationId,
          source: { name: 'Quản Trị Mạng', url },
          title: article.title,
          location: marketLocation('vietnam'),
          mentions,
          // An editorial page states no reply count, and its comment widget is
          // loaded separately — 0 here means "not published", as elsewhere.
          comments: 0,
          views: null,
          reactions: null,
          uniqueAuthors: null,
          publishedAt,
          crawledAt,
        });
      }
    }

    log(
      `Quản Trị Mạng: ${posts.size} records from ${read} articles read ` +
        `(${tooOld} older than ${config.historyYears} years, left out)`,
    );
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
