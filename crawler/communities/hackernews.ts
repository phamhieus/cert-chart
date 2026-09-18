import type { CommunityPost } from '../../src/types';
import { aliasesOf } from '../../src/utils/certAliases';
import { countCertificationMentions } from '../normalize/certifications';
import { stripHtml } from '../normalize/jobPosting';
import type { CommunityCrawler, CrawlContext } from '../types';
import { fetchJson } from '../util/http';

const API = 'https://hn.algolia.com/api/v1';
const ORIGIN = 'https://news.ycombinator.com';

interface AlgoliaHit {
  objectID?: string;
  title?: string;
  story_title?: string;
  story_text?: string;
  comment_text?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
  nbPages?: number;
}

/** Stories carry the discussion metrics; comments are where opinions on an exam live. */
type HitKind = 'story' | 'comment';

function textOf(hit: AlgoliaHit, kind: HitKind): string {
  return kind === 'story'
    ? `${hit.title ?? ''}\n${stripHtml(hit.story_text ?? '')}`
    : stripHtml(hit.comment_text ?? '');
}

/**
 * A comment's own words, not the story it hangs under. The parent title says
 * nothing about why the exam was named — "Ask HN: Who wants to be hired?"
 * describes a thousand unrelated comments — and the link already opens the
 * comment in context.
 */
function titleOf(hit: AlgoliaHit, kind: HitKind): string {
  if (kind === 'story') return hit.title?.trim() ?? '';

  const excerpt = stripHtml(hit.comment_text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (excerpt) return excerpt.length > 140 ? `${excerpt.slice(0, 140)}…` : excerpt;

  const story = hit.story_title?.trim();
  return story ? `Comment on: ${story}` : '';
}

/**
 * Hacker News through the public Algolia search API — the same index the site's
 * own search box uses. No key, no robots.txt (hn.algolia.com serves none), and
 * it is full-text: every hit is matched on the keyword appearing in the story or
 * comment itself.
 *
 * Both stories and comments are read. Comments are the larger half of the signal
 * for certifications — "is the CKA worth it" is answered in threads, not posts.
 * Neither states an author location, so records are filed as global with an
 * unknown scope.
 */
export const hackerNewsCrawler: CommunityCrawler = {
  id: 'hackernews',
  name: 'Hacker News',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.hackernews.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.hackernews;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();

    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - config.historyYears);
    const since = Math.floor(cutoff.getTime() / 1000);

    const kinds: HitKind[] = settings.includeComments ? ['story', 'comment'] : ['story'];

    for (const cert of certifications) {
      if (posts.size >= settings.maxRecords) break;

      // Quoted, so "AWS Certified Solutions Architect" is one phrase rather than
      // four loose terms that would match half of Hacker News.
      const terms = [...new Set(aliasesOf(cert))]
        .filter((alias) => alias.length >= 3)
        .slice(0, settings.termsPerCert);

      for (const term of terms) {
        for (const kind of kinds) {
          for (let page = 0; page < settings.pagesPerTerm; page += 1) {
            const url =
              `${API}/search?query=${encodeURIComponent(`"${term}"`)}` +
              `&tags=${kind}&hitsPerPage=${settings.resultsPerPage}&page=${page}` +
              `&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}`;

            let response: AlgoliaResponse;
            try {
              response = await fetchJson<AlgoliaResponse>(url, { timeoutMs: 30_000 });
            } catch (error) {
              log(`Hacker News: "${term}" ${kind}s failed (${(error as Error).message})`);
              break;
            }

            const hits = response.hits ?? [];
            if (hits.length === 0) break;

            for (const hit of hits) {
              if (!hit.objectID) continue;
              const title = titleOf(hit, kind);
              if (!title) continue;

              for (const [certificationId, mentions] of countCertificationMentions(
                textOf(hit, kind),
                aliasIndex,
              )) {
                const id = `hn_${hit.objectID}_${certificationId}`;
                posts.set(id, {
                  id,
                  certificationId,
                  source: { name: 'Hacker News', url: `${ORIGIN}/item?id=${hit.objectID}` },
                  title,
                  location: { country: 'GLOBAL', market: 'global', scope: 'unknown' },
                  mentions,
                  comments: hit.num_comments ?? 0,
                  views: null,
                  // Algolia exposes points on stories only, never on comments.
                  reactions: hit.points ?? null,
                  uniqueAuthors: null,
                  publishedAt: hit.created_at?.slice(0, 10) ?? crawledDate,
                  crawledAt,
                });
              }
            }

            if (page + 1 >= (response.nbPages ?? 1)) break;
          }
        }
      }
    }

    log(`Hacker News: ${posts.size} stories and comments name a tracked certification`);
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
