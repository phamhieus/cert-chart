import type { Job } from '../../src/types';
import type { CrawlContext, JobCrawler } from '../types';

const ORIGIN = 'https://www.linkedin.com';

const REASON =
  'LinkedIn prohibits automated access in robots.txt; its Jobs API is partner-only, ' +
  'so there is no permitted way to crawl it';

/**
 * Listed but never run, on purpose. LinkedIn's robots.txt opens with "The use of
 * robots or other automated means to access LinkedIn without the express
 * permission of LinkedIn is strictly prohibited", and the Job Posting API is
 * gated behind the Talent Solutions partner programme — there is no self-serve
 * credential that would make this legitimate.
 *
 * It stays in the source list so the dashboard can say why LinkedIn is missing.
 * A reader who does not see it there assumes it was forgotten; a reader who sees
 * it greyed out with this note knows the gap is a decision, not an oversight.
 * Delete this file only alongside a signed partner agreement.
 */
export const linkedInCrawler: JobCrawler = {
  id: 'linkedin',
  name: 'LinkedIn',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: () => false,

  skipReason: () => REASON,

  run(_context: CrawlContext): Promise<Job[]> {
    return Promise.reject(new Error(REASON));
  },
};
