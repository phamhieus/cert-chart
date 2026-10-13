import type { Certification, CommunityPost } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import type { CommunityCrawler, CrawlContext } from '../types';
import {
  accessToken,
  credentials as redditCredentials,
  locationOf,
  type RedditListing,
} from './reddit';

const API = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-flash';
/** How many of the newest posts per certification are written to the log. */
const LOGGED_RECENT = 10;

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

interface RedditAnswer {
  id?: string;
  estimatedPostCount?: number;
  posts?: Array<{ url?: string; title?: string; subreddit?: string; publishedAt?: string }>;
}

interface CertAnswer {
  estimate: number | null;
  suggestions: Suggestion[];
}

interface Suggestion {
  postId: string;
  url: string;
  title?: string;
  subreddit?: string;
  publishedAt?: string;
}

const SYSTEM_PROMPT =
  'You report on Reddit activity. Answer with JSON only, in exactly this shape, one entry per ' +
  'certification asked about: {"results": [{"id": "<certification id as given>", ' +
  '"estimatedPostCount": <integer>, "posts": [{"url": "https://www.reddit.com/r/<sub>/comments/<id>/<slug>/", ' +
  '"title": "<post title>", "subreddit": "<sub>", "publishedAt": "YYYY-MM-DD"}]}]}. ' +
  'Only reddit.com posts. Escape every double quote inside strings. Only include posts you ' +
  'are confident exist; an empty list is better than a guessed URL.';

/** Reddit's base-36 post id, from any `/comments/<id>/` permalink. */
const POST_ID = /reddit\.com\/(?:r\/[^/\s"]+\/)?comments\/([a-z0-9]{4,10})/i;

function apiKey(): string | null {
  return process.env.DEEPSEEK_API_KEY || null;
}

async function ask(prompt: string, model: string, key: string): Promise<string> {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      // Every certification's posts arrive in this one answer.
      max_tokens: 64_000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const completion = (await response.json()) as ChatCompletion;
  return completion.choices?.[0]?.message?.content ?? '';
}

/**
 * Splits the one batched answer into each certification's estimate and
 * suggested posts. Malformed JSON throws: with every certification in a single
 * answer, a permalink pulled out by pattern could not be tied back to one.
 */
function parseAnswers(content: string): Map<string, CertAnswer> {
  const { results } = JSON.parse(content) as { results?: RedditAnswer[] };
  const byCert = new Map<string, CertAnswer>();

  for (const result of results ?? []) {
    if (!result.id) continue;
    const suggestions = new Map<string, Suggestion>();
    for (const post of result.posts ?? []) {
      const postId = post.url?.match(POST_ID)?.[1]?.toLowerCase();
      if (!postId || suggestions.has(postId)) continue;
      suggestions.set(postId, {
        postId,
        url: post.url!,
        title: post.title?.trim() || undefined,
        subreddit: post.subreddit?.replace(/^r\//, '') || undefined,
        publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(post.publishedAt ?? '') ? post.publishedAt : undefined,
      });
    }
    const estimate = Number.isFinite(result.estimatedPostCount) ? result.estimatedPostCount! : null;
    byCert.set(result.id, { estimate, suggestions: [...suggestions.values()] });
  }
  return byCert;
}

/**
 * Reddit posts named by DeepSeek, per certification: an estimated post count
 * and the most recent posts the model knows of.
 *
 * A language model has no access to Reddit and will produce plausible
 * permalinks that do not exist, so nothing it says is stored as-is when the
 * Reddit API is available: with REDDIT_CLIENT_ID/SECRET set, every suggested
 * post is looked up by id and kept only if it exists and names the
 * certification, with title, date, comments and upvotes taken from Reddit.
 * Without those credentials the suggestions are stored with
 * `unverified: true` — flagged in the UI and skipped by scoring. Reddit's
 * robots.txt is `Disallow: /`, so the permalinks are never fetched directly.
 *
 * The estimated count is the model's guess and is only logged; the verified
 * count per certification is logged beside it.
 */
export const deepSeekCrawler: CommunityCrawler = {
  id: 'deepseek',
  name: 'DeepSeek',
  url: 'https://www.deepseek.com',
  type: 'community',

  isEnabled: (config) => config.sources.deepseek.enabled && apiKey() !== null,

  skipReason: (config) =>
    config.sources.deepseek.enabled ? 'Needs DEEPSEEK_API_KEY' : 'Disabled in crawler/config.ts',

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.deepseek;
    const key = apiKey();
    if (!key) return [];
    const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();

    let redditToken: string | null = null;
    if (redditCredentials()) {
      try {
        redditToken = await accessToken(config.userAgent);
      } catch (error) {
        log(`DeepSeek: Reddit auth failed (${(error as Error).message}), storing posts unverified`);
      }
    } else {
      log('DeepSeek: no REDDIT_CLIENT_ID/SECRET, storing posts unverified');
    }

    /** Looks the suggested posts up on Reddit; unknown ids are simply absent from the answer. */
    async function lookUp(postIds: string[]): Promise<RedditListing> {
      const fullnames = postIds.map((id) => `t3_${id}`).join(',');
      const response = await fetch(`https://oauth.reddit.com/by_id/${fullnames}`, {
        headers: { authorization: `Bearer ${redditToken}`, 'user-agent': config.userAgent },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      await new Promise((resolve) => setTimeout(resolve, config.requestDelayMs));
      return (await response.json()) as RedditListing;
    }

    async function collect(cert: Certification, { estimate, suggestions }: CertAnswer): Promise<CommunityPost[]> {
      const kept: CommunityPost[] = [];

      if (redditToken) {
        const listing = suggestions.length > 0 ? await lookUp(suggestions.map((s) => s.postId)) : {};
        for (const child of listing.data?.children ?? []) {
          const post = child.data;
          if (!post?.id || !post.title || !post.permalink) continue;
          const mentions =
            countCertificationMentions(`${post.title}\n${post.selftext ?? ''}`, aliasIndex).get(
              cert.id,
            ) ?? 0;
          if (mentions === 0) continue;

          kept.push({
            // Same id as the Reddit crawler's record, so the two never double count.
            id: `reddit_${post.id}_${cert.id}`,
            certificationId: cert.id,
            source: { name: 'DeepSeek', url: `https://www.reddit.com${post.permalink}` },
            title: post.title,
            location: locationOf(post.subreddit ?? '', config.sources.reddit.subredditMarkets),
            mentions,
            comments: post.num_comments ?? 0,
            views: null,
            reactions: post.ups ?? null,
            uniqueAuthors: null,
            publishedAt: post.created_utc
              ? new Date(post.created_utc * 1000).toISOString().slice(0, 10)
              : crawledDate,
            crawledAt,
          });
        }
      } else {
        for (const suggestion of suggestions) {
          kept.push({
            // Not the Reddit crawler's id: an unverified suggestion must never
            // replace a verified, scored record of the same post.
            id: `deepseek_${suggestion.postId}_${cert.id}`,
            certificationId: cert.id,
            source: { name: 'DeepSeek', url: suggestion.url },
            title: suggestion.title ?? 'Reddit post',
            location: locationOf(suggestion.subreddit ?? '', config.sources.reddit.subredditMarkets),
            mentions: 1,
            comments: 0,
            views: null,
            reactions: null,
            uniqueAuthors: null,
            publishedAt: suggestion.publishedAt ?? crawledDate,
            crawledAt,
            unverified: true,
          });
        }
      }

      kept.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      log(
        `DeepSeek: ${cert.shortName} on Reddit — ~${estimate ?? '?'} posts estimated, ` +
          `${suggestions.length} suggested, ${kept.length} ${redditToken ? 'verified' : 'unverified'}`,
      );
      for (const post of kept.slice(0, LOGGED_RECENT)) {
        log(`DeepSeek:   ${post.publishedAt} ${post.source.url} — "${post.title}"`);
      }
      return kept;
    }

    // One request for every certification: the instructions and JSON shape are
    // sent once instead of once per certification.
    const asked = certifications.slice(0, settings.maxCertifications);
    const prompt =
      'For each certification below, estimate how many Reddit posts discuss it, then list up to ' +
      `${settings.postsPerCert} Reddit posts about it (exam experiences, study plans, pass/fail ` +
      'reports, questions), most recent first. Return json.\n\n' +
      asked
        .map((cert) => `- id: ${cert.id} — "${cert.name}"${cert.code ? ` (${cert.code})` : ''} by ${cert.vendor}`)
        .join('\n');

    let answers: Map<string, CertAnswer>;
    try {
      answers = parseAnswers(await ask(prompt, model, key));
    } catch (error) {
      log(`DeepSeek: request failed (${(error as Error).message})`);
      return [];
    }

    for (const cert of asked) {
      if (posts.size >= settings.maxRecords) break;
      try {
        const answer = answers.get(cert.id) ?? { estimate: null, suggestions: [] };
        for (const post of await collect(cert, answer)) posts.set(post.id, post);
      } catch (error) {
        log(`DeepSeek: ${cert.shortName} failed (${(error as Error).message})`);
      }
    }

    log(`DeepSeek: ${posts.size} Reddit posts kept`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
