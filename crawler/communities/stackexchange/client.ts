import type { CommunityPost } from '../../../src/types';
import { countCertificationMentions } from '../../normalize/certifications';
import { stripHtml } from '../../normalize/jobPosting';
import type { CrawlContext } from '../../types';
import { fetchJson } from '../../util/http';

export const API = 'https://api.stackexchange.com/2.3';

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
export function appKey(): string | undefined {
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

export interface StackCrawlSettings {
  termsPerCert: number;
  resultsPerTerm: number;
  maxRecords: number;
}

export interface StackCrawlOptions {
  /** API `site` parameters, e.g. `stackoverflow`, `serverfault`. */
  sites: string[];
  /** The name every record carries, so provenance counts line up per crawler. */
  sourceName: string;
  /** Record id, kept stable across runs so repeated crawls merge. */
  recordId: (site: string, questionId: number, certificationId: string) => string;
  settings: StackCrawlSettings;
}

/**
 * One pass of the Stack Exchange network. Two endpoints, because neither alone
 * is enough: `/search/excerpts` returns the question text, which is what proves
 * a certification is actually named rather than merely ranked highly for it,
 * while `/questions` carries the view and answer counts. The second pass batches
 * up to 100 ids per call.
 *
 * Questions carry no author location, so every post is filed as global with an
 * unknown scope rather than guessed into a market.
 */
export async function crawlStackSites(
  options: StackCrawlOptions,
  { config, certifications, aliasIndex, now, log }: CrawlContext,
): Promise<CommunityPost[]> {
  const { settings } = options;
  // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
  const crawledAt = now.toISOString();
  const crawledDate = crawledAt.slice(0, 10);
  let quota: number | null = null;

  const windowStart = new Date(now);
  windowStart.setFullYear(windowStart.getFullYear() - config.historyYears);
  const fromDate = Math.floor(windowStart.getTime() / 1000);

  const posts = new Map<string, CommunityPost>();

  for (const site of options.sites) {
    if (posts.size >= settings.maxRecords) break;

    // question id → certification id → mentions counted in its own text.
    const mentionsByQuestion = new Map<number, Map<string, number>>();

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
          log(`${options.sourceName} (${site}): "${term}" failed (${(error as Error).message})`);
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

    log(`${options.sourceName} (${site}): ${mentionsByQuestion.size} questions name a tracked certification`);

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
        log(`${options.sourceName} (${site}): metrics batch failed (${(error as Error).message})`);
        continue;
      }

      quota = response.quota_remaining ?? quota;
      await respectBackoff(response);

      for (const question of response.items ?? []) {
        if (!question.question_id || !question.title) continue;
        const hits = mentionsByQuestion.get(question.question_id);
        if (!hits) continue;

        for (const [certificationId, mentions] of hits) {
          const id = options.recordId(site, question.question_id, certificationId);
          posts.set(id, {
            id,
            certificationId,
            source: {
              name: options.sourceName,
              url: question.link ?? `https://${site}.com/q/${question.question_id}`,
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
    `${options.sourceName}: ${posts.size} records stored` +
      (quota === null ? '' : ` (${quota} API calls left today)`),
  );
  return [...posts.values()].slice(0, settings.maxRecords);
}
