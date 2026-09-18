import type { CommunityPost } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import { stripHtml } from '../normalize/jobPosting';
import type { CommunityCrawler, CrawlContext } from '../types';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://dev.to';
const API = `${ORIGIN}/api/articles`;

interface DevToArticle {
  id?: number;
  title?: string;
  description?: string;
  url?: string;
  comments_count?: number;
  positive_reactions_count?: number;
  published_at?: string;
  tag_list?: string[];
}

/**
 * dev.to's public articles API, one pass per tag. `robots.txt` disallows
 * `/search` but not `/api/*`, and the feed for a tag is not reliably
 * newest-first (confirmed by comparing consecutive pages), so unlike Zenn this
 * pages a fixed count rather than stopping at a date cutoff. Articles carry no
 * author location, so every post is filed as global with an unknown scope.
 */
export const devToCrawler: CommunityCrawler = {
  id: 'devto',
  name: 'dev.to',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.devto.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.devto;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();

    for (const tag of settings.tags) {
      for (let page = 1; page <= settings.pagesPerTag; page += 1) {
        if (posts.size >= settings.maxRecords) break;

        const url = `${API}?tag=${encodeURIComponent(tag)}&per_page=100&page=${page}`;

        let articles: DevToArticle[];
        try {
          articles = await fetchJson<DevToArticle[]>(url, { timeoutMs: 30_000 });
        } catch (error) {
          log(`dev.to: tag "${tag}" page ${page} failed (${(error as Error).message})`);
          break;
        }

        if (articles.length === 0) break;

        for (const article of articles) {
          if (!article.id || !article.title || !article.url) continue;
          const text = `${article.title}\n${stripHtml(article.description ?? '')}\n${(article.tag_list ?? []).join(' ')}`;
          const mentionsByCert = countCertificationMentions(text, aliasIndex);

          for (const [certificationId, mentions] of mentionsByCert) {
            const id = `devto_${article.id}_${certificationId}`;
            posts.set(id, {
              id,
              certificationId,
              source: { name: 'dev.to', url: article.url },
              title: article.title,
              location: { country: 'GLOBAL', market: 'global', scope: 'unknown' },
              mentions,
              comments: article.comments_count ?? 0,
              views: null,
              reactions: article.positive_reactions_count ?? null,
              uniqueAuthors: null,
              publishedAt: article.published_at?.slice(0, 10) ?? crawledDate,
              crawledAt,
            });
          }
        }
      }
    }

    log(`dev.to: ${posts.size} articles matched a tracked certification`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
