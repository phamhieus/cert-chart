import type { CommunityPost } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import { stripHtml } from '../normalize/jobPosting';
import type { CommunityCrawler, CrawlContext } from '../types';
import { fetchJson } from '../util/http';

const API = 'https://api.stackexchange.com/2.3';
const ORIGIN = 'https://stackexchange.com';

interface ExcerptResponse {
  items?: Array<{
    question_id?: number;
    title?: string;
    body?: string;
    tags?: string[];
  }>;
  quota_remaining?: number;
  /** Seconds the API insists we wait before the next call on this method. */
  backoff?: number;
}

interface QuestionResponse {
  items?: Array<{
    question_id?: number;
    title?: string;
    link?: string;
    score?: number;
    view_count?: number;
    answer_count?: number;
    creation_date?: number;
  }>;
  quota_remaining?: number;
  backoff?: number;
}

/** Raises the daily quota from 300 to 10,000 requests when set. */
function appKey(): string | undefined {
  return process.env.STACK_APP_KEY || undefined;
}

function withKey(url: string): string {
  const key = appKey();
  return key ? `${url}&key=${encodeURIComponent(key)}` : url;
}

async function respectBackoff(payload: { backoff?: number }): Promise<void> {
  // The API hands back a backoff when a method is hit too often; ignoring it is
  // what gets an IP throttled.
  if (payload.backoff) await new Promise((r) => setTimeout(r, payload.backoff! * 1000));
}

/**
 * The API always returns a `link` for a real question; this only backstops a
 * missing one. Most Stack Exchange sites live at `{site}.stackexchange.com`,
 * but the oldest three kept their pre-network domains.
 */
const SITE_DOMAIN: Record<string, string> = {
  stackoverflow: 'stackoverflow.com',
  serverfault: 'serverfault.com',
  superuser: 'superuser.com',
};

function fallbackLink(site: string, questionId: number): string {
  const domain = SITE_DOMAIN[site] ?? `${site}.stackexchange.com`;
  return `https://${domain}/q/${questionId}`;
}

/**
 * `stackoverflow` keeps its original `so_` id, unscoped by site — this crawler
 * covered only that one site for a long time, so every already-stored record
 * uses that shape. Reusing it here means re-crawling stackoverflow.com updates
 * those same records in place; a site-scoped id would instead pile up a
 * second, duplicate record next to each one (a real bug, caught by diffing a
 * live run: 30 of 42 "new" records turned out to be exactly that).
 */
function recordId(site: string, questionId: number, certificationId: string): string {
  const key = site === 'stackoverflow' ? `so_${questionId}` : `sx_${site}_${questionId}`;
  return `${key}_${certificationId}`;
}

/**
 * The Stack Exchange network through its official public API — no scraping,
 * no credentials required. `STACK_APP_KEY` only raises the quota.
 *
 * `sites` fans this out across several Stack Exchange properties, not just
 * stackoverflow.com: serverfault.com and security.stackexchange.com measurably
 * out-cover Stack Overflow for networking and security certifications, and
 * pm.stackexchange.com is where PMP/Scrum questions actually live (see
 * `crawler/config.ts` for the numbers that picked this list). Question ids are
 * only unique *within* a site, so every id below is scoped `site:question_id`.
 *
 * Two passes per site, because neither endpoint alone is enough:
 * `/search/excerpts` returns the question text, which is what proves a
 * certification is actually named rather than merely ranked highly for it,
 * while `/questions` carries the view and answer counts. The second pass
 * batches up to 100 ids per call.
 */
export const stackOverflowCrawler: CommunityCrawler = {
  id: 'stackoverflow',
  name: 'Stack Exchange',
  url: ORIGIN,
  type: 'community',

  isEnabled: (config) => config.sources.stackoverflow.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<CommunityPost[]> {
    const settings = config.sources.stackoverflow;
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    let quota: number | null = null;

    const windowStart = new Date(now);
    windowStart.setFullYear(windowStart.getFullYear() - config.historyYears);
    const fromDate = Math.floor(windowStart.getTime() / 1000);

    // site → question id → certification id → mentions counted in its own text.
    const mentionsBySite = new Map<string, Map<number, Map<string, number>>>();

    for (const site of settings.sites) {
      const mentionsByQuestion = new Map<number, Map<string, number>>();
      mentionsBySite.set(site, mentionsByQuestion);

      for (const cert of certifications) {
        if (mentionsByQuestion.size >= settings.maxRecords) break;

        // Both spellings: the full name finds exam-prep threads, the short name
        // finds the working questions where people write "CKA" or "AZ-104".
        const terms = [...new Set([cert.name, cert.shortName, cert.code].filter(Boolean))].slice(
          0,
          settings.termsPerCert,
        ) as string[];

        for (const term of terms) {
          // Bounded to the history window: sorted by votes with no bound, the top
          // 100 are all a decade old and the recent months come back empty.
          const url = withKey(
            `${API}/search/excerpts?order=desc&sort=votes&site=${site}` +
              `&fromdate=${fromDate}&pagesize=${settings.resultsPerTerm}` +
              `&q=${encodeURIComponent(term)}`,
          );

          let response: ExcerptResponse;
          try {
            response = await fetchJson<ExcerptResponse>(url, { timeoutMs: 30_000 });
          } catch (error) {
            log(`Stack Exchange: ${site} "${term}" failed (${(error as Error).message})`);
            continue;
          }

          quota = response.quota_remaining ?? quota;
          await respectBackoff(response);

          for (const item of response.items ?? []) {
            if (!item.question_id) continue;
            const text = `${stripHtml(item.title ?? '')} ${stripHtml(item.body ?? '')} ${(item.tags ?? []).join(' ')}`;
            const hits = countCertificationMentions(text, aliasIndex);
            if (hits.size === 0) continue;

            const existing = mentionsByQuestion.get(item.question_id) ?? new Map<string, number>();
            for (const [certificationId, mentions] of hits) {
              existing.set(certificationId, Math.max(existing.get(certificationId) ?? 0, mentions));
            }
            mentionsByQuestion.set(item.question_id, existing);
          }
        }
      }

      log(`Stack Exchange: ${site} — ${mentionsByQuestion.size} questions name a tracked certification`);
    }

    const posts = new Map<string, CommunityPost>();

    for (const [site, mentionsByQuestion] of mentionsBySite) {
      const ids = [...mentionsByQuestion.keys()];

      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const url = withKey(
          `${API}/questions/${batch.join(';')}?order=desc&sort=votes&site=${site}&pagesize=100`,
        );

        let response: QuestionResponse;
        try {
          response = await fetchJson<QuestionResponse>(url, { timeoutMs: 30_000 });
        } catch (error) {
          log(`Stack Exchange: ${site} metrics batch failed (${(error as Error).message})`);
          continue;
        }

        quota = response.quota_remaining ?? quota;
        await respectBackoff(response);

        for (const question of response.items ?? []) {
          if (!question.question_id || !question.title) continue;
          const hits = mentionsByQuestion.get(question.question_id);
          if (!hits) continue;

          for (const [certificationId, mentions] of hits) {
            const id = recordId(site, question.question_id, certificationId);
            posts.set(id, {
              id,
              certificationId,
              source: {
                name: 'Stack Exchange',
                url: question.link ?? fallbackLink(site, question.question_id),
              },
              title: stripHtml(question.title),
              location: { country: 'GLOBAL', market: 'global', scope: 'unknown' },
              mentions,
              // Stack Exchange counts answers, not comments, on a question.
              comments: question.answer_count ?? 0,
              views: question.view_count ?? null,
              reactions: question.score ?? null,
              uniqueAuthors: null,
              publishedAt: question.creation_date
                ? new Date(question.creation_date * 1000).toISOString().slice(0, 10)
                : crawledDate,
              crawledAt,
            });
          }
        }
      }
    }

    log(
      `Stack Exchange: ${posts.size} records stored across ${settings.sites.length} sites` +
        (quota === null ? '' : ` (${quota} API calls left today)`),
    );
    return [...posts.values()].slice(0, settings.maxRecords);
  },
};
