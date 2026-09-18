import type { CommunityPost, GeoLocation, MarketId } from '../../src/types';
import { aliasesOf } from '../../src/utils/certAliases';
import type { CommunityCrawler, CrawlContext } from '../types';
import { countCertificationMentions } from '../normalize/certifications';
import { marketLocation } from '../normalize/location';

interface RedditListing {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        title?: string;
        selftext?: string;
        subreddit?: string;
        num_comments?: number;
        ups?: number;
        permalink?: string;
        created_utc?: number;
      };
    }>;
  };
}

const MARKETS: MarketId[] = ['vietnam', 'singapore', 'japan', 'global'];

function credentials(): { id: string; secret: string } | null {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

async function accessToken(userAgent: string): Promise<string> {
  const creds = credentials();
  if (!creds) throw new Error('Reddit credentials missing');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Reddit auth failed (${response.status})`);

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error('Reddit auth returned no token');
  return payload.access_token;
}

function locationOf(
  subreddit: string,
  configured: Array<{ name: string; market: string }>,
): GeoLocation {
  const match = configured.find((entry) => entry.name.toLowerCase() === subreddit.toLowerCase());
  const market = MARKETS.find((id) => id === match?.market);
  // An unmapped subreddit says nothing about where its posters are.
  return market ? marketLocation(market) : { country: 'GLOBAL', market: 'global', scope: 'unknown' };
}

/**
 * Reddit's robots.txt disallows crawling entirely, so this uses the official API
 * with app-only OAuth. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (a "script"
 * app at reddit.com/prefs/apps) to enable it; without them the source is skipped.
 */
export const redditCrawler: CommunityCrawler = {
  id: 'reddit',
  name: 'Reddit',
  url: 'https://www.reddit.com',
  type: 'community',

  isEnabled: (config) => config.sources.reddit.enabled && credentials() !== null,

  skipReason: (config) =>
    config.sources.reddit.enabled
      ? 'Needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (robots.txt forbids scraping)'
      : 'Disabled in crawler/config.ts',

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.reddit;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const token = await accessToken(config.userAgent);
    const posts = new Map<string, CommunityPost>();

    for (const cert of certifications) {
      const terms = aliasesOf(cert)
        .filter((alias) => alias.length >= 4)
        .slice(0, 3)
        .map((alias) => `"${alias}"`)
        .join(' OR ');
      // `t: 'all'` rather than a year: the window this dataset wants is
      // `historyYears`, and newest-first ordering still puts recent posts first.
      const query = new URLSearchParams({ q: terms, sort: 'new', t: 'all', limit: '100' });

      let listing: RedditListing;
      try {
        const response = await fetch(`https://oauth.reddit.com/search?${query}`, {
          headers: {
            authorization: `Bearer ${token}`,
            'user-agent': config.userAgent,
          },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        listing = (await response.json()) as RedditListing;
      } catch (error) {
        log(`Reddit: query for ${cert.shortName} failed (${(error as Error).message})`);
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, config.requestDelayMs));

      for (const child of listing.data?.children ?? []) {
        const post = child.data;
        if (!post?.id || !post.title || !post.permalink) continue;

        const mentions =
          countCertificationMentions(`${post.title}\n${post.selftext ?? ''}`, aliasIndex).get(
            cert.id,
          ) ?? 0;
        if (mentions === 0) continue;

        const id = `reddit_${post.id}_${cert.id}`;
        posts.set(id, {
          id,
          certificationId: cert.id,
          source: { name: 'Reddit', url: `https://www.reddit.com${post.permalink}` },
          title: post.title,
          location: locationOf(post.subreddit ?? '', settings.subredditMarkets),
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
    }

    log(`Reddit: ${posts.size} discussions matched a tracked certification`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
