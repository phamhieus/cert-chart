import type { Job } from '../../src/types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { extractLdJsonBlocks, parseJobPostingLd } from '../normalize/jobPosting';
import type { CrawlContext, JobCrawler } from '../types';
import {
  BROWSER_SETUP_HINT,
  ChallengedError,
  isBrowserAvailable,
  withBrowser,
} from '../util/browser';
import { fetchText } from '../util/http';

const ORIGIN = 'https://careerviet.vn';
const DETAIL = /https:\/\/careerviet\.vn\/vi\/tim-viec-lam\/[a-z0-9-]+\.[0-9A-Z]+\.html/g;

function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `.../network-engineer.35C8755B.html` → `35C8755B`. */
function postingId(url: string): string {
  return /\.([0-9A-Z]+)\.html$/.exec(url)?.[1] ?? url;
}

/**
 * CareerViet renders its result list client-side from an API that robots.txt
 * puts off limits, so the listing needs a browser. Detail pages are a different
 * story: they are server-rendered with a full schema.org JobPosting, so those
 * are fetched over plain HTTP — one browser navigation per search term instead
 * of one per posting.
 */
export const careerVietCrawler: JobCrawler = {
  id: 'careerviet',
  name: 'CareerViet',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.careerviet.enabled,

  skipReason: (config) =>
    config.sources.careerviet.enabled ? BROWSER_SETUP_HINT : 'Disabled in crawler/config.ts',

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.careerviet;
    if (!(await isBrowserAvailable())) throw new Error(BROWSER_SETUP_HINT);

    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();
    const detailUrls = new Set<string>();

    const terms = [...new Set(certifications.map((cert) => slug(cert.shortName)))].slice(
      0,
      settings.searchTerms,
    );

    await withBrowser(
      async (session) => {
        for (const term of terms) {
          if (detailUrls.size >= settings.maxDetailPages) break;
          const searchUrl = `${ORIGIN}/viec-lam/${term}-k-vi.html`;

          let html: string;
          try {
            html = await session.open(searchUrl, 'a[href*="/vi/tim-viec-lam/"]');
          } catch (error) {
            if (error instanceof ChallengedError) {
              log(`CareerViet: bot check on "${term}" — stopping the listing pass`);
              break;
            }
            log(`CareerViet: search "${term}" failed (${(error as Error).message})`);
            continue;
          }

          let found = 0;
          for (const match of html.matchAll(DETAIL)) {
            if (detailUrls.size >= settings.maxDetailPages) break;
            if (!detailUrls.has(match[0])) found += 1;
            detailUrls.add(match[0]);
          }
          log(`CareerViet: "${term}" → ${found} new postings`);
        }
      },
      { minDelayMs: settings.navigationDelayMs, settleMs: settings.settleMs },
    );

    for (const url of detailUrls) {
      let html: string;
      try {
        html = await fetchText(url, { timeoutMs: 45_000, retries: 1 });
      } catch (error) {
        log(`CareerViet: failed ${url} (${(error as Error).message})`);
        continue;
      }

      const structured = parseJobPostingLd(extractLdJsonBlocks(html));
      if (!structured?.title) continue;

      const matched = extractJobCertifications(
        `${structured.title}\n${structured.description}`,
        aliasIndex,
      );
      if (matched.length === 0) continue;

      jobs.set(url, {
        id: `careerviet_${postingId(url)}`,
        title: structured.title,
        company: structured.company || 'Unknown',
        location: resolveLocation(structured.location || 'Vietnam'),
        certifications: matched,
        source: { name: 'CareerViet', url },
        postedAt: structured.datePosted ?? crawledDate,
        crawledAt,
      });
    }

    log(`CareerViet: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
