import type { Course } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import type { CourseCrawler, CrawlContext } from '../types';

const ORIGIN = 'https://www.udemy.com';
const API = `${ORIGIN}/api-2.0/courses/`;

interface UdemyResponse {
  count?: number;
  results?: Array<{
    id?: number;
    title?: string;
    headline?: string;
    url?: string;
    is_paid?: boolean;
    price_detail?: { amount?: number; currency?: string } | null;
    locale?: { locale?: string; title?: string };
    visible_instructors?: Array<{ display_name?: string }>;
  }>;
}

function credentials(): { id: string; secret: string } | null {
  const id = process.env.UDEMY_CLIENT_ID;
  const secret = process.env.UDEMY_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/**
 * Udemy's robots.txt disallows `/api-2.0/` and in fact every URL carrying a
 * query string, so there is no scraping route to its catalogue. The Affiliate
 * API is the sanctioned one: approval into the affiliate programme issues a
 * client id and secret, and those requests are authorised access rather than
 * crawling — which is why this calls `fetch` directly instead of going through
 * the robots-checked helper, the same way the Reddit crawler does. Without the
 * credentials the source is skipped, never scraped as a fallback.
 */
export const udemyCrawler: CourseCrawler = {
  id: 'udemy',
  name: 'Udemy',
  url: ORIGIN,
  type: 'course-provider',

  isEnabled: (config) => config.sources.udemy.enabled && credentials() !== null,

  skipReason: (config) =>
    config.sources.udemy.enabled
      ? 'Needs UDEMY_CLIENT_ID and UDEMY_CLIENT_SECRET (Affiliate API; robots.txt forbids scraping)'
      : 'Disabled in crawler/config.ts',

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<Course[]> {
    const settings = config.sources.udemy;
    const creds = credentials();
    if (!creds) throw new Error('Udemy credentials missing');

    const lastChecked = now.toISOString();
    const authorization = `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')}`;
    const courses = new Map<string, Course>();

    for (const cert of certifications) {
      if (courses.size >= settings.maxRecords) break;

      const query = new URLSearchParams({
        search: cert.name,
        page_size: String(settings.resultsPerCert),
        ordering: 'highest-rated',
        'fields[course]': 'title,headline,url,price_detail,is_paid,locale,visible_instructors',
      });

      let payload: UdemyResponse;
      try {
        const response = await fetch(`${API}?${query}`, {
          headers: { authorization, accept: 'application/json, text/plain, */*' },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        payload = (await response.json()) as UdemyResponse;
      } catch (error) {
        log(`Udemy: search for ${cert.shortName} failed (${(error as Error).message})`);
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, config.requestDelayMs));

      for (const course of payload.results ?? []) {
        if (!course.id || !course.title) continue;
        // The search is fuzzy, so the title still has to name the certification.
        const hits = countCertificationMentions(
          `${course.title} ${course.headline ?? ''}`,
          aliasIndex,
        );
        if (!hits.has(cert.id)) continue;

        const amount = course.price_detail?.amount;
        const price =
          typeof amount === 'number' && Number.isFinite(amount)
            ? amount
            : course.is_paid === false
              ? 0
              : null;

        const id = `udemy_${course.id}`;
        courses.set(id, {
          id,
          certificationId: cert.id,
          name: course.title,
          provider: {
            name: course.visible_instructors?.[0]?.display_name
              ? `Udemy — ${course.visible_instructors[0].display_name}`
              : 'Udemy',
            url: ORIGIN,
          },
          courseUrl: course.url ? new URL(course.url, ORIGIN).toString() : ORIGIN,
          type: 'online-platform',
          location: { country: 'GLOBAL', market: 'global' },
          delivery: ['online'],
          language: course.locale?.title || 'Unknown',
          price,
          currency: course.price_detail?.currency,
          lastChecked,
        });
      }
    }

    log(`Udemy: ${courses.size} courses stored`);
    return [...courses.values()].slice(0, settings.maxRecords);
  },
};
