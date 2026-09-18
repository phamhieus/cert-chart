import type { CommunityPost } from '../../../src/types';
import { aliasesOf } from '../../../src/utils/certAliases';
import { countCertificationMentions } from '../../normalize/certifications';
import { stripHtml } from '../../normalize/jobPosting';
import { marketLocation } from '../../normalize/location';
import type { CommunityCrawler, CrawlContext } from '../../types';
import {
  ZENN_ORIGIN,
  fetchArticleDetail,
  listTopicArticles,
  searchArticles,
  type ZennArticle,
} from './api';

/**
 * Japanese developer publishing platform. Two passes, because a hashtag is not a
 * mention: the topic listing only reaches articles an author chose to tag, so
 * the crawler also searches Zenn's full text for each certification's aliases
 * and counts the keyword where it actually appears. When a search hit does not
 * name the certification in its title, the article body is fetched once and
 * scanned, rather than trusting the ranking.
 *
 * Articles are attributed to the Japan market as a whole — Zenn states no
 * location for authors, so none is inferred.
 */
export const zennCrawler: CommunityCrawler = {
  id: 'zenn',
  name: 'Zenn',
  url: ZENN_ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.zenn.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.zenn;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();

    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);
    const cutoffIso = cutoff.toISOString();

    // One detail fetch per article at most, whichever pass asked for it first.
    const bodyText = new Map<string, string>();
    let detailFetches = 0;

    const store = (article: ZennArticle, text: string): boolean => {
      if (!article.title || !article.path) return false;
      const hits = countCertificationMentions(text, aliasIndex);

      for (const [certificationId, mentions] of hits) {
        const id = `zenn_${article.id ?? article.slug}_${certificationId}`;
        posts.set(id, {
          id,
          certificationId,
          source: { name: 'Zenn', url: new URL(article.path, ZENN_ORIGIN).toString() },
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

      return hits.size > 0;
    };

    /** Title plus body text, fetching the body once and only within budget. */
    const fullText = async (article: ZennArticle): Promise<string> => {
      const slug = article.slug;
      if (!slug) return article.title ?? '';
      const cached = bodyText.get(slug);
      if (cached !== undefined) return `${article.title ?? ''}\n${cached}`;
      if (detailFetches >= settings.maxDetailPages) return article.title ?? '';

      detailFetches += 1;
      try {
        const detail = await fetchArticleDetail(slug);
        const text = `${stripHtml(detail.bodyHtml)}\n${detail.topics.join(' ')}`;
        bodyText.set(slug, text);
        return `${article.title ?? ''}\n${text}`;
      } catch (error) {
        bodyText.set(slug, '');
        log(`Zenn: body for ${slug} failed (${(error as Error).message})`);
        return article.title ?? '';
      }
    };

    // Pass 1 — keyword search. This is what makes a mention a mention: the term
    // has to appear in the article, not in its tags.
    // Articles whose title named nothing, so a second term does not re-read them.
    const titleSilent = new Set<string>();
    let bodyHits = 0;

    for (const cert of certifications) {
      if (posts.size >= settings.maxRecords) break;

      const terms = [...new Set(aliasesOf(cert))]
        .filter((alias) => alias.length >= 3)
        .slice(0, settings.termsPerCert);

      for (const term of terms) {
        for (let page = 1; page <= settings.pagesPerTerm; page += 1) {
          let batch: Awaited<ReturnType<typeof searchArticles>>;
          try {
            batch = await searchArticles(term, page);
          } catch (error) {
            log(`Zenn: search "${term}" page ${page} failed (${(error as Error).message})`);
            break;
          }

          for (const article of batch.articles) {
            if ((article.published_at ?? '') < cutoffIso) continue;
            // The title is free; only reach for the body when it says nothing.
            if (store(article, article.title ?? '')) continue;
            if (article.slug && titleSilent.has(article.slug)) continue;
            if (article.slug) titleSilent.add(article.slug);
            if (store(article, await fullText(article))) bodyHits += 1;
          }

          if (batch.nextPage === null) break;
        }
      }
    }

    log(
      `Zenn: ${posts.size} records from keyword search, ${bodyHits} of them named only ` +
        `in the body (${detailFetches} bodies read)`,
    );

    // Pass 2 — topic listings. Cheaper and broader than search for the topics
    // certification write-ups cluster under, so it still earns its place.
    const beforeTopics = posts.size;

    for (const topic of settings.topics) {
      if (posts.size >= settings.maxRecords) break;

      for (let page = 1; page <= settings.pagesPerTopic; page += 1) {
        let articles: ZennArticle[];
        try {
          articles = await listTopicArticles(topic, page);
        } catch (error) {
          log(`Zenn: topic "${topic}" page ${page} failed (${(error as Error).message})`);
          break;
        }

        if (articles.length === 0) break;
        // Articles come newest-first, so a page entirely older than the window
        // means every later page is too.
        const past = articles.every((article) => (article.published_at ?? '') < cutoffIso);

        for (const article of articles) {
          store(article, article.title ?? '');
        }

        if (past) break;
      }
    }

    log(`Zenn: ${posts.size - beforeTopics} more from topic listings, ${posts.size} records total`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
