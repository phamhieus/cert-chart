import { CheerioCrawler, Configuration } from 'crawlee';
import type { Job } from '../../src/types';
import type { CrawlContext, JobCrawler } from '../types';
import { extractJobCertifications } from '../normalize/certifications';
import { resolveLocation } from '../normalize/location';
import { parseJobPostingLd, stripHtml } from '../normalize/jobPosting';

const ORIGIN = 'https://itviec.com';

/** Listing links carry tracking parameters; the path alone identifies a posting. */
function canonicalUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

/** Seconds from a `Retry-After` header, or null when absent or a date. */
function retryAfterMs(value: string | string[] | undefined): number | null {
  const seconds = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function jobId(url: string): string {
  const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? url;
  return `itviec_${slug}`;
}

/**
 * ITviec renders job lists and detail pages server-side, so a Cheerio crawl is
 * enough. Crawlee handles the list → detail queue, retries and concurrency.
 */
export const itviecCrawler: JobCrawler = {
  id: 'itviec',
  name: 'ITviec',
  url: ORIGIN,
  type: 'job-board',

  isEnabled: (config) => config.sources.itviec.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<Job[]> {
    const settings = config.sources.itviec;
    const jobs = new Map<string, Job>();
    // Exact instant this crawl run started; `crawledDate` only backs a missing publish date.
    const crawledAt = now.toISOString();
    const crawledDate = crawledAt.slice(0, 10);
    let rateLimited = false;

    const crawler: CheerioCrawler = new CheerioCrawler(
      {
        // ITviec answers 429 quickly under load, so this stays deliberately slow.
        maxConcurrency: 1,
        maxRequestsPerMinute: settings.requestsPerMinute,
        maxRequestsPerCrawl: settings.maxRequests,
        maxRequestRetries: settings.rateLimitRetries,
        requestHandlerTimeoutSecs: 45,
        additionalMimeTypes: ['application/xhtml+xml'],
        preNavigationHooks: [
          async ({ request }) => {
            request.headers = {
              ...request.headers,
              'user-agent': config.userAgent,
              'accept-language': 'vi,en;q=0.8',
            };
            await new Promise((r) => setTimeout(r, config.requestDelayMs));
          },
        ],

        async requestHandler({ request, $, enqueueLinks }) {
          if (request.label === 'DETAIL') {
            const structured = parseJobPostingLd(
              $('script[type="application/ld+json"]')
                .map((_, el) => $(el).contents().text())
                .get(),
            );
            const title = structured?.title || $('h1').first().text().trim();
            if (!title) return;

            const description =
              structured?.description ||
              stripHtml($('.job-details__overview, .job-content, main').html() ?? '');
            const certifications = extractJobCertifications(`${title}\n${description}`, aliasIndex);
            if (certifications.length === 0) return;

            const company =
              structured?.company ||
              $('.employer-name, .company-name, [class*="employer"] a').first().text().trim() ||
              'Unknown';
            const locationText =
              structured?.location ||
              $('.job-details__map-address, [class*="address"], .normal-text').first().text().trim();
            const url = canonicalUrl(request.url);

            jobs.set(url, {
              id: jobId(url),
              title,
              company,
              location: resolveLocation(locationText || 'Vietnam'),
              certifications,
              source: { name: 'ITviec', url },
              postedAt: structured?.datePosted ?? crawledDate,
              crawledAt,
            });
            return;
          }

          await enqueueLinks({
            selector: 'a[href*="/it-jobs/"]',
            label: 'DETAIL',
            transformRequestFunction: (req) => {
              const path = new URL(req.url).pathname;
              // A posting slug is several words plus a numeric id; skill pages
              // like /it-jobs/az-104 must not be mistaken for one.
              if (!/^\/it-jobs\/(?:[^/-]+-){2,}\d+$/.test(path)) return false;
              req.url = canonicalUrl(req.url);
              req.uniqueKey = req.url;
              return req;
            },
          });
        },

        // A 429 retried straight away just earns another one. With a single
        // worker, waiting here pauses the whole crawl, which is the point.
        async errorHandler({ request, response }, error) {
          if (!error.message.includes('429')) return;
          const waitMs =
            retryAfterMs(response?.headers['retry-after']) ??
            settings.rateLimitBackoffMs * 2 ** request.retryCount;
          log(`ITviec: rate limited, waiting ${Math.round(waitMs / 1000)}s before retrying`);
          await new Promise((r) => setTimeout(r, waitMs));
        },

        async failedRequestHandler({ request, error }) {
          log(`ITviec: failed ${request.url} (${(error as Error).message})`);
          // Still limited after every backoff: stop with what was collected
          // rather than keep knocking and risk a longer block.
          if ((error as Error).message.includes('429') && !rateLimited) {
            rateLimited = true;
            log('ITviec: still rate limited after backing off — stopping early');
            await crawler.autoscaledPool?.abort();
          }
        },
      },
      new Configuration({ persistStorage: false }),
    );

    const listUrls = Array.from(
      { length: settings.listPages },
      (_, i) => `${ORIGIN}/it-jobs${i === 0 ? '' : `?page=${i + 1}`}`,
    );

    // Searching per certification finds far more relevant postings than paging
    // through the whole board; a term with no results returns 404 and is skipped.
    const searchUrls = [...new Set(certifications.map((cert) => cert.shortName))].map(
      (term) => `${ORIGIN}/it-jobs?query=${encodeURIComponent(term)}`,
    );

    await crawler.run([...listUrls, ...searchUrls]);
    log(
      `ITviec: ${jobs.size} postings mentioning a tracked certification` +
        (rateLimited ? ' (stopped early on rate limiting)' : ''),
    );

    return [...jobs.values()].slice(0, settings.maxRecords);
  },
};
