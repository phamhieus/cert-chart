import type { CommunityPost } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import { marketLocation } from '../normalize/location';
import { toExcerpt } from '../normalize/title';
import type { CommunityCrawler, CrawlContext } from '../types';
import { braveApiKey, braveSearch, searchTerm } from '../util/brave';

/**
 * LinkedIn posts and articles (`/posts/`, `/pulse/`), found through the Brave
 * Search API. As with the LinkedIn job crawler, no linkedin.com page is ever
 * requested — robots.txt forbids it — so a post is the title, URL, snippet and
 * date the search engine returns. The certification is matched on the title
 * and snippet; reactions and comments are not in a search result and stay
 * null/0 rather than guessed.
 */
export const linkedInPostsCrawler: CommunityCrawler = {
  id: 'linkedin-posts',
  name: 'LinkedIn Posts',
  url: 'https://www.linkedin.com',
  type: 'community',

  isEnabled: (config) => config.sources.linkedinPosts.enabled && braveApiKey() !== null,

  skipReason: (config) =>
    config.sources.linkedinPosts.enabled
      ? 'Needs BRAVE_API_KEY (read through search results; robots.txt forbids crawling LinkedIn)'
      : 'Disabled in crawler/config.ts',

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.linkedinPosts;
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();
    let results = 0;

    for (const cert of certifications.slice(0, settings.maxCertifications)) {
      if (posts.size >= settings.maxRecords) break;

      let hits;
      try {
        hits = await braveSearch(
          `(site:linkedin.com/posts OR site:linkedin.com/pulse) "${searchTerm(cert)}"`,
          settings.resultsPerCert,
        );
      } catch (error) {
        log(`LinkedIn Posts: search for ${cert.shortName} failed (${(error as Error).message})`);
        continue;
      }
      results += hits.length;

      for (const hit of hits) {
        const path = new URL(hit.url).pathname;
        if (!/^\/(posts|pulse)\//.test(path)) continue;

        const title = hit.title.replace(/\s*[|\-–]\s*LinkedIn\s*$/i, '').trim();
        const mentionsByCert = countCertificationMentions(`${title}\n${hit.description}`, aliasIndex);
        const slug = path.split('/').filter(Boolean).slice(1).join('_');

        // A post can name several certifications; each gets its own record,
        // as on every other community source.
        for (const [certificationId, mentions] of mentionsByCert) {
          const id = `linkedin_${slug}_${certificationId}`;
          posts.set(id, {
            id,
            certificationId,
            source: { name: 'LinkedIn Posts', url: `https://www.linkedin.com${path}` },
            title,
            excerpt: toExcerpt(hit.description) || undefined,
            location: marketLocation('global', 'unknown'),
            mentions,
            comments: 0,
            views: null,
            reactions: null,
            uniqueAuthors: null,
            publishedAt: hit.publishedAt ?? crawledDate,
            crawledAt,
          });
        }
      }
    }

    log(`LinkedIn Posts: ${posts.size} records from ${results} search results`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
