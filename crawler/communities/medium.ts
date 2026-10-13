import * as cheerio from 'cheerio';
import type { CommunityPost } from '../../src/types';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { stripHtml } from '../normalize/jobPosting';
import { marketLocation } from '../normalize/location';
import { fetchText } from '../util/http';

const ORIGIN = 'https://medium.com';

/**
 * Medium, read through the per-tag RSS feeds its own help centre documents
 * (`/feed/tag/{tag}`). `robots.txt` disallows `/m/`, `/me/`, `/search`,
 * `/trending`, `/r/`, `/media/`, the edit and share paths and any URL carrying
 * a `source=` query — none of which this touches. `/feed/` carries no rule at
 * all, and the only `source=` involved is the tracking parameter Medium hangs
 * on its own outbound links, which is stripped off the stored URL rather than
 * fetched. The AI-crawler bans in the same file (`ClaudeBot`, `GPTBot`,
 * `Bytespider`, …) are per-agent `Disallow: /` groups and do not apply to this
 * crawler's user-agent. `util/http.ts` re-checks all of it on every request,
 * so if Medium ever closes `/feed/` this source starts reporting itself
 * blocked instead of quietly carrying on — the same way Remotive does today.
 *
 * Medium also rate limits, harder than the global 900ms delay allows for: a
 * fifteen-tag run paced only by `util/http.ts` lost nine tags to 429, and the
 * escalating retry there did not win them back. Hence `requestDelayMs` in this
 * source's config, waited between tags on top of the global delay. A tag that
 * still gets throttled is logged and skipped rather than failing the run, and
 * the next run picks its stories up — the feed is the ten newest either way.
 *
 * Two properties of the feed shape the design:
 *
 * 1. **A tag feed is the 10 newest stories and does not paginate.** So each
 *    tag is a fixed ten-story budget per run, not a starting point to page
 *    through — the opposite of dev.to, where `pagesPerTag` makes a broad tag
 *    pay off. Spend the budget on certification-shaped tags: `cissp` and `cka`
 *    measured 10/10 stories naming a tracked exam, while `devops`,
 *    `kubernetes`, `cybersecurity`, `cloud-computing`, `terraform` and
 *    `certification` measured 0/10 each and were dropped (numbers in
 *    `crawler/config.ts`). Coverage accumulates run by run, like VOZ and
 *    Viblo, rather than arriving in one pass, and the run logs per-tag yield
 *    so a tag that stops paying shows up.
 * 2. **A tag feed carries no story body.** `content:encoded` is empty on
 *    every item (checked across whole feeds — it is populated on profile
 *    feeds, not these), and `description` is a teaser: a subtitle or opening
 *    sentence of 90–180 characters followed by "Continue reading on Medium".
 *    So a story is matched on its title, that teaser and its own tags — the
 *    dev.to shape rather than the VOZ one — and a certification named only
 *    deep in the body is missed. Reading bodies would mean fetching each story
 *    page, which is a request per story rather than one per ten.
 *
 * Stories carry no location, view, clap or response count in the feed, so every
 * post is filed as global with an unknown scope and those figures stay null
 * rather than guessed. `dc:creator` does name the author, but `uniqueAuthors`
 * stays null all the same: a Medium story has exactly one, and storing 1 would
 * make the author signal a second copy of the post count — credit that the
 * other single-author platforms here (dev.to, Zenn) correctly do not take.
 *
 * Note for anyone crawling from Vietnam: several Vietnamese ISPs DNS-block
 * medium.com, which surfaces here as every tag failing to connect. That is the
 * network, not the source — see the run's error message.
 */
export const mediumCrawler: CommunityCrawler = {
  id: 'medium',
  name: 'Medium',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.medium.enabled && config.sources.medium.tags.length > 0,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.medium;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);

    let scanned = 0;
    let failedTags = 0;
    let lastError: string | undefined;
    // Per-tag yield, logged at the end: with a ten-story budget per tag and no
    // paging, which tags earn their request is the only tuning decision here.
    const yieldByTag: Array<{ tag: string; matched: number; stories: number }> = [];

    for (const [position, tag] of settings.tags.entries()) {
      // Medium's own pacing, on top of util/http.ts's global delay — see the
      // 429 note in the header.
      if (position > 0) {
        await new Promise((resolve) => setTimeout(resolve, settings.requestDelayMs));
      }

      let xml: string;
      try {
        xml = await fetchText(`${ORIGIN}/feed/tag/${encodeURIComponent(tag)}`, {
          accept: 'application/rss+xml, application/xml',
        });
      } catch (error) {
        failedTags += 1;
        lastError = (error as Error).message;
        log(`Medium: tag "${tag}" failed (${lastError})`);
        continue;
      }

      const $ = cheerio.load(xml, { xmlMode: true });
      const items = $('item');
      // An empty feed is how Medium answers a tag slug that does not exist —
      // it shows up as 0/0 in the yield line below.
      const before = posts.size;
      let tagStories = 0;

      items.each((_, element) => {
        const item = $(element);
        const title = item.find('title').first().text().trim();
        // `link` carries RSS tracking parameters (`?source=rss------…`); the
        // story URL without them is what gets stored and shown.
        const link = item.find('link').first().text().trim().split('?')[0];
        if (!title || !link) return;

        const published = item.find('pubDate').first().text().trim();
        const parsed = published ? new Date(published) : null;
        const publishedAt =
          parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
        // The feed is newest-first but short, so an old story is dropped rather
        // than used to stop reading — there is no next page to stop before.
        if (parsed && !Number.isNaN(parsed.getTime()) && parsed < cutoff) return;

        scanned += 1;
        tagStories += 1;

        const summary = stripHtml(item.find('description').first().text());
        // A story's own tags name exams the title misses ("sc-200-exam" on a
        // story pulled in by the aws-certification feed), so they are matched too.
        const tags = item
          .find('category')
          .map((_i, c) => $(c).text().trim())
          .get()
          .join(' ');
        const mentionsByCert = countCertificationMentions(
          `${title}\n${summary}\n${tags}`,
          aliasIndex,
        );
        if (mentionsByCert.size === 0) return;

        // `guid` is `https://medium.com/p/{postId}`; the slug in `link` changes
        // when a story is retitled, so the id comes from the guid where there
        // is one.
        const guid = item.find('guid').first().text().trim();
        const storyId = (guid || link).split('/').filter(Boolean).at(-1) ?? link;

        for (const [certificationId, mentions] of mentionsByCert) {
          const id = `medium_${storyId}_${certificationId}`;
          posts.set(id, {
            id,
            certificationId,
            source: { name: 'Medium', url: link },
            title,
            location: marketLocation('global', 'unknown'),
            mentions,
            // The feed states no response, view or clap count — left null
            // rather than guessed. `comments` is a count, so 0 is the honest
            // "not stated" here, matching the other RSS-only sources.
            comments: 0,
            views: null,
            reactions: null,
            uniqueAuthors: null,
            publishedAt: publishedAt ?? crawledDate,
            crawledAt,
          });
        }
      });

      yieldByTag.push({ tag, matched: posts.size - before, stories: tagStories });
    }

    if (failedTags === settings.tags.length) {
      const throttled = (lastError ?? '').includes('429');
      throw new Error(
        throttled
          ? `every tag feed was rate limited (${lastError}). Medium throttles by IP and the ` +
            `penalty outlasts a single run, so this clears on its own — give it time rather ` +
            `than lowering requestDelayMs, and shorten the tag list if it keeps happening.`
          : `every tag feed failed, last error: ${lastError}. If that is a DNS or connection ` +
            `failure rather than an HTTP status, medium.com is blocked on this network — ` +
            `several Vietnamese ISPs resolve it to 127.0.0.1 — and a public resolver ` +
            `(1.1.1.1, 8.8.8.8) is the fix, not a change to this crawler.`,
      );
    }

    log(
      `Medium: ${posts.size} of ${scanned} stories across ${settings.tags.length - failedTags} tags name a tracked certification`,
    );
    log(
      `Medium: yield by tag — ${yieldByTag
        .sort((a, b) => b.matched - a.matched)
        .map(({ tag, matched, stories }) => `${tag} ${matched}/${stories}`)
        .join(', ')}`,
    );
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
