import type { CommunityPost } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import type { CommunityCrawler, CrawlContext } from '../types';
import { fetchJson } from '../util/http';

const API = 'https://dev.to/api';
const ORIGIN = 'https://dev.to';

interface DevToArticle {
  id?: number;
  title?: string;
  description?: string;
  url?: string;
  path?: string;
  comments_count?: number;
  public_reactions_count?: number;
  published_at?: string;
}

/**
 * DEV (Forem). Its full-text search endpoint is disallowed by robots.txt, so
 * discovery runs off the public tag listings — but a tag is not a mention: what
 * is counted is the certification named in the article's own title and summary.
 * An article tagged `aws` that never says "Solutions Architect" contributes
 * nothing.
 *
 * Authors state no location, so records are filed as global with an unknown
 * scope.
 */
export const devToCrawler: CommunityCrawler = {
  id: 'devto',
  name: 'DEV Community',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.devto.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.devto;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();

    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);
    const cutoffIso = cutoff.toISOString();

    let scanned = 0;
    let throttled = 0;
    let first = true;

    for (const tag of settings.tags) {
      if (posts.size >= settings.maxRecords) break;

      for (let page = 1; page <= settings.pagesPerTag; page += 1) {
        const url =
          `${API}/articles?tag=${encodeURIComponent(tag)}` +
          `&per_page=${settings.resultsPerPage}&page=${page}`;

        // DEV answers 429 well before the shared delay would suggest, and a
        // 429 costs the rest of the tag, so the gap is paid up front.
        if (!first) await new Promise((r) => setTimeout(r, settings.pauseMs));
        first = false;

        let articles: DevToArticle[];
        try {
          articles = await fetchJson<DevToArticle[]>(url, { timeoutMs: 30_000 });
        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('429')) throttled += 1;
          log(`DEV: tag "${tag}" page ${page} failed (${message})`);
          break;
        }

        if (articles.length === 0) break;
        scanned += articles.length;

        for (const article of articles) {
          if (!article.id || !article.title) continue;
          if ((article.published_at ?? '') < cutoffIso) continue;

          // Title and summary only. The tag list is how the article was found,
          // not evidence that it discusses the exam.
          const text = `${article.title}\n${article.description ?? ''}`;

          for (const [certificationId, mentions] of countCertificationMentions(text, aliasIndex)) {
            const id = `devto_${article.id}_${certificationId}`;
            posts.set(id, {
              id,
              certificationId,
              source: {
                name: 'DEV Community',
                url: article.url ?? new URL(article.path ?? '/', ORIGIN).toString(),
              },
              title: article.title,
              location: { country: 'GLOBAL', market: 'global', scope: 'unknown' },
              mentions,
              comments: article.comments_count ?? 0,
              views: null,
              reactions: article.public_reactions_count ?? null,
              uniqueAuthors: null,
              publishedAt: article.published_at?.slice(0, 10) ?? crawledDate,
              crawledAt,
            });
          }
        }

        if (articles.length < settings.resultsPerPage) break;
      }
    }

    log(
      `DEV: ${posts.size} of ${scanned} scanned articles name a tracked certification` +
        (throttled > 0 ? ` (${throttled} tags cut short by rate limiting)` : ''),
    );
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
