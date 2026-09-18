import type { CommunityPost } from '../../../src/types';
import { countCertificationMentions } from '../../normalize/certifications';
import { stripHtml } from '../../normalize/jobPosting';
import { marketLocation } from '../../normalize/location';
import type { CommunityCrawler, CrawlContext } from '../../types';
import { DNH_ORIGIN, fetchTopicBody, listLatestTopics, type DiscourseTopic } from './api';

/**
 * Vietnamese developer forum (Discourse). `/search` is disallowed by robots.txt,
 * so this reads the public `latest.json` listings — and, for threads whose title
 * names no certification, the thread itself. Vietnamese forum titles are often
 * "Lộ trình học mạng?" with the exam named three lines into the post, so title
 * matching alone throws away most of the Vietnamese signal this dataset has.
 *
 * Threads are attributed to Vietnam market-wide, never to a city.
 */
export const dayNhauHocCrawler: CommunityCrawler = {
  id: 'daynhauhoc',
  name: 'Dạy Nhau Học',
  url: DNH_ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.daynhauhoc.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.daynhauhoc;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);
    let reachedCutoff = false;
    let bodyReads = 0;
    let fromBody = 0;

    const store = (topic: DiscourseTopic, mentionsByCert: Map<string, number>): boolean => {
      if (mentionsByCert.size === 0 || !topic.id || !topic.title) return false;

      for (const [certificationId, mentions] of mentionsByCert) {
        const id = `dnh_${topic.id}_${certificationId}`;
        posts.set(id, {
          id,
          certificationId,
          source: {
            name: 'Dạy Nhau Học',
            url: `${DNH_ORIGIN}/t/${topic.slug ?? 'topic'}/${topic.id}`,
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

      return true;
    };

    for (let page = 0; page < settings.pages && !reachedCutoff; page += 1) {
      let topics: DiscourseTopic[];
      try {
        topics = await listLatestTopics(page);
      } catch (error) {
        log(`Dạy Nhau Học: page ${page} failed (${(error as Error).message})`);
        break;
      }

      if (topics.length === 0) break;
      if (topics.every((topic) => (topic.created_at ?? '') < cutoff.toISOString())) {
        reachedCutoff = true;
      }

      for (const topic of topics) {
        if (!topic.title || !topic.id) continue;

        // The title is already in hand; only open the thread when it says nothing.
        if (store(topic, countCertificationMentions(topic.title, aliasIndex))) continue;
        if (bodyReads >= settings.maxTopicBodies) continue;

        bodyReads += 1;
        try {
          const body = stripHtml(await fetchTopicBody(topic.id));
          if (store(topic, countCertificationMentions(`${topic.title}\n${body}`, aliasIndex))) {
            fromBody += 1;
          }
        } catch (error) {
          log(`Dạy Nhau Học: thread ${topic.id} failed (${(error as Error).message})`);
        }
      }
    }

    log(
      `Dạy Nhau Học: ${posts.size} records — ${fromBody} of them found in thread bodies ` +
        `(${bodyReads} threads opened)`,
    );
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
