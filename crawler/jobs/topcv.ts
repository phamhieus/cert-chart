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

const ORIGIN = 'https://www.topcv.vn';
const DETAIL = /https:\/\/www\.topcv\.vn\/viec-lam\/[a-z0-9-]+\/(\d+)\.html/g;

/** `AWS SAA` → `aws-saa`, which is the shape TopCV's search paths take. */
function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Listing links carry tracking parameters; the path alone identifies a posting. */
function canonical(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

/**
 * TopCV puts every page behind a Cloudflare challenge — plain HTTP gets a 403 on
 * both listings and detail pages — so this is the one crawler that drives a real
 * browser. robots.txt allows these paths (only CV paths are disallowed) and each
 * navigation is still checked against it; the browser is there for the bot
 * check, nothing else. Its pacing is deliberately much slower than the HTTP
 * crawlers': a few quick page loads are enough to earn an "Attention Required".
 */
export const topCvCrawler: JobCrawler = {
  id: 'topcv',
  name: 'TopCV',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.topcv.enabled,

  skipReason: (config) =>
    config.sources.topcv.enabled ? BROWSER_SETUP_HINT : 'Disabled in crawler/config.ts',

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.topcv;
    if (!(await isBrowserAvailable())) throw new Error(BROWSER_SETUP_HINT);

    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    const jobs = new Map<string, Job>();

    const terms = [...new Set(certifications.map((cert) => slug(cert.shortName)))].slice(
      0,
      settings.searchTerms,
    );

    await withBrowser(
      async (session) => {
        const detailUrls = new Set<string>();

        for (const term of terms) {
          if (detailUrls.size >= settings.maxDetailPages) break;
          const searchUrl = `${ORIGIN}/tim-viec-lam-${term}`;

          let html: string;
          try {
            // Wait on the links themselves: class names change with every
            // redesign, the URL shape has not.
            html = await session.open(searchUrl, 'a[href*="/viec-lam/"]');
          } catch (error) {
            if (error instanceof ChallengedError) {
              log(`TopCV: bot check on "${term}" — stopping to avoid a harder block`);
              break;
            }
            log(`TopCV: search "${term}" failed (${(error as Error).message})`);
            continue;
          }

          let found = 0;
          for (const match of html.matchAll(DETAIL)) {
            if (detailUrls.size >= settings.maxDetailPages) break;
            detailUrls.add(canonical(match[0]));
            found += 1;
          }
          log(`TopCV: "${term}" → ${found} postings`);
        }

        for (const url of detailUrls) {
          let html: string;
          try {
            html = await session.open(url);
          } catch (error) {
            if (error instanceof ChallengedError) {
              log('TopCV: bot check on a detail page — stopping with what was collected');
              break;
            }
            log(`TopCV: failed ${url} (${(error as Error).message})`);
            continue;
          }

          const structured = parseJobPostingLd(extractLdJsonBlocks(html));
          if (!structured?.title) continue;

          const matched = extractJobCertifications(
            `${structured.title}\n${structured.description}`,
            aliasIndex,
          );
          if (matched.length === 0) continue;

          const id = /\/(\d+)\.html$/.exec(url)?.[1] ?? url;
          jobs.set(url, {
            id: `topcv_${id}`,
            title: structured.title,
            company: structured.company || 'Unknown',
            location: resolveLocation(structured.location || 'Vietnam'),
            certifications: matched,
            source: { name: 'TopCV', url },
            postedAt: structured.datePosted ?? crawledDate,
            crawledAt,
          });
        }
      },
      { minDelayMs: settings.navigationDelayMs, settleMs: settings.settleMs },
    );

    log(`TopCV: ${jobs.size} postings mentioning a tracked certification`);
    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
