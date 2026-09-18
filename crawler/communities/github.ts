import type { CommunityPost } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import type { CommunityCrawler, CrawlContext } from '../types';
import { fetchJson } from '../util/http';

const API = 'https://api.github.com';
const ORIGIN = 'https://github.com';

interface RepoSearchResponse {
  total_count?: number;
  items?: Array<{
    id?: number;
    full_name?: string;
    html_url?: string;
    description?: string | null;
    stargazers_count?: number;
    open_issues_count?: number;
    forks_count?: number;
    created_at?: string;
    topics?: string[];
  }>;
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

/**
 * GitHub's search API is rate limited per minute, not per hour: 10 requests
 * unauthenticated, 30 with a token. Going faster returns 403 for the rest of the
 * window, so the spacing is derived from the limit rather than guessed.
 */
function spacingMs(): number {
  return token() ? 2_100 : 6_500;
}

/**
 * Study repos, exam notes and awesome-lists are where certification prep shows
 * up on GitHub. Repositories state no author location, so they are filed as
 * global with an unknown scope.
 */
export const gitHubCrawler: CommunityCrawler = {
  id: 'github',
  name: 'GitHub',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.github.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.github;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const posts = new Map<string, CommunityPost>();
    const auth = token();

    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    };
    if (auth) headers.authorization = `Bearer ${auth}`;

    const collect = (response: RepoSearchResponse): void => {
      for (const repo of response.items ?? []) {
        if (!repo.id || !repo.full_name) continue;
        const haystack =
          `${repo.full_name.replace(/[-_/]/g, ' ')} ${repo.description ?? ''} ` +
          `${(repo.topics ?? []).join(' ')}`;

        for (const [certificationId, mentions] of countCertificationMentions(haystack, aliasIndex)) {
          const id = `gh_${repo.id}_${certificationId}`;
          posts.set(id, {
            id,
            certificationId,
            source: { name: 'GitHub', url: repo.html_url ?? `${ORIGIN}/${repo.full_name}` },
            title: repo.description?.trim() || repo.full_name,
            location: { country: 'GLOBAL', market: 'global', scope: 'unknown' },
            mentions,
            // Repositories have no comment count; open issues is the closest
            // public measure of activity around one.
            comments: repo.open_issues_count ?? 0,
            views: null,
            reactions: repo.stargazers_count ?? null,
            uniqueAuthors: null,
            publishedAt: repo.created_at?.slice(0, 10) ?? crawledDate,
            crawledAt,
          });
        }
      }
    };

    let requests = 0;

    for (const cert of certifications) {
      if (requests >= settings.maxRequests || posts.size >= settings.maxRecords) break;

      // Quoted phrases only: GitHub ranks loose terms so broadly that a bare
      // "AWS" returns half the cloud ecosystem. Both spellings are searched —
      // repo names carry "AWS SAA" far more often than the full exam title.
      const terms = ([cert.name, cert.shortName, cert.code].filter(Boolean) as string[]).slice(
        0,
        settings.termsPerCert,
      );

      for (const term of new Set(terms)) {
        if (requests >= settings.maxRequests) break;

        const query = `"${term}" in:name,description,readme`;
        const url =
          `${API}/search/repositories?q=${encodeURIComponent(query)}` +
          `&sort=stars&order=desc&per_page=${settings.resultsPerCert}`;

        if (requests > 0) await new Promise((r) => setTimeout(r, spacingMs()));
        requests += 1;

        try {
          collect(await fetchJson<RepoSearchResponse>(url, { headers, timeoutMs: 30_000 }));
        } catch (error) {
          log(`GitHub: "${term}" failed (${(error as Error).message})`);
        }
      }
    }

    log(
      `GitHub: ${posts.size} repositories matched a tracked certification ` +
        `(${requests} search calls${auth ? ', authenticated' : ', unauthenticated'})`,
    );
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
