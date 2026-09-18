import type { CommunityPost } from '../../src/types';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { marketLocation } from '../normalize/location';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://zenn.dev';

interface ZennResponse {
  articles?: Array<{
    id?: number;
    slug?: string;
    path?: string;
    title?: string;
    comments_count?: number;
    liked_count?: number;
    published_at?: string;
  }>;
  next_page?: number | null;
}

/**
 * Japanese developer publishing platform. Articles are attributed to the Japan
 * market as a whole — Zenn states no location for authors, so none is inferred.
 */
export const zennCrawler: CommunityCrawler = {
  id: 'zenn',
  name: 'Zenn',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.zenn.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.zenn;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);
    const cutoffIso = cutoff.toISOString();

    for (const topic of settings.topics) {
      for (let page = 1; page <= settings.pagesPerTopic; page += 1) {
        const url = `${ORIGIN}/api/articles?topicname=${encodeURIComponent(topic)}&order=latest&count=48&page=${page}`;

        let response: ZennResponse;
        try {
          response = await fetchJson<ZennResponse>(url);
        } catch (error) {
          log(`Zenn: topic "${topic}" page ${page} failed (${(error as Error).message})`);
          break;
        }

        const articles = response.articles ?? [];
        if (articles.length === 0) break;
        // Articles come newest-first, so a page entirely older than the window
        // means every later page is too.
        const past = articles.every((article) => (article.published_at ?? '') < cutoffIso);

        for (const article of articles) {
          if (!article.title || !article.path) continue;
          const mentionsByCert = countCertificationMentions(article.title, aliasIndex);

          for (const [certificationId, mentions] of mentionsByCert) {
            const id = `zenn_${article.id ?? article.slug}_${certificationId}`;
            posts.set(id, {
              id,
              certificationId,
              source: { name: 'Zenn', url: new URL(article.path, ORIGIN).toString() },
              title: article.title,
              location: marketLocation('japan'),
              mentions,
              comments: article.comments_count ?? 0,
              views: null,
              reactions: article.liked_count ?? null,
              uniqueAuthors: null,
              publishedAt: article.published_at?.slice(0, 10) ?? crawledDate,
              crawledAt,
            });
          }
        }

        if (past) break;
      }
    }

    log(`Zenn: ${posts.size} articles matched a tracked certification`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
