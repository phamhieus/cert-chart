import type { CommunityPost } from '../../src/types';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { marketLocation } from '../normalize/location';
import { fetchJson } from '../util/http';

const ORIGIN = 'https://daynhauhoc.com';

interface DiscourseLatest {
  topic_list?: {
    topics?: Array<{
      id?: number;
      slug?: string;
      title?: string;
      posts_count?: number;
      reply_count?: number;
      views?: number;
      like_count?: number;
      created_at?: string;
      posters?: unknown[];
    }>;
  };
}

/**
 * Vietnamese developer forum (Discourse). `/search` is disallowed by robots.txt,
 * so this reads the public `latest.json` listings and matches thread titles.
 * Threads are attributed to Vietnam market-wide, never to a city.
 */
export const dayNhauHocCrawler: CommunityCrawler = {
  id: 'daynhauhoc',
  name: 'Dạy Nhau Học',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.daynhauhoc.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.daynhauhoc;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();
    // `order=created` walks the forum backwards in time; the default ordering is
    // by last activity, which never reaches older threads at all.
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);
    let reachedCutoff = false;

    for (let page = 0; page < settings.pages && !reachedCutoff; page += 1) {
      let response: DiscourseLatest;
      try {
        response = await fetchJson<DiscourseLatest>(
          `${ORIGIN}/latest.json?order=created&page=${page}`,
        );
      } catch (error) {
        log(`Dạy Nhau Học: page ${page} failed (${(error as Error).message})`);
        break;
      }

      const topics = response.topic_list?.topics ?? [];
      if (topics.length === 0) break;
      if (topics.every((topic) => (topic.created_at ?? '') < cutoff.toISOString())) {
        reachedCutoff = true;
      }

      for (const topic of topics) {
        if (!topic.title || !topic.id) continue;
        const mentionsByCert = countCertificationMentions(topic.title, aliasIndex);

        for (const [certificationId, mentions] of mentionsByCert) {
          const id = `dnh_${topic.id}_${certificationId}`;
          posts.set(id, {
            id,
            certificationId,
            source: {
              name: 'Dạy Nhau Học',
              url: `${ORIGIN}/t/${topic.slug ?? 'topic'}/${topic.id}`,
            },
            title: topic.title,
            location: marketLocation('vietnam'),
            mentions,
            comments: topic.reply_count ?? Math.max(0, (topic.posts_count ?? 1) - 1),
            views: topic.views ?? null,
            reactions: topic.like_count ?? null,
            uniqueAuthors: topic.posters?.length ?? null,
            publishedAt: topic.created_at?.slice(0, 10) ?? crawledDate,
            crawledAt,
          });
        }
      }
    }

    log(`Dạy Nhau Học: ${posts.size} threads matched a tracked certification`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
