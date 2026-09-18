import type { Course } from '../../src/types';
import { countCertificationMentions } from '../normalize/certifications';
import { extractLdJsonBlocks, stripHtml } from '../normalize/jobPosting';
import type { CourseCrawler, CrawlContext } from '../types';
import { fetchText } from '../util/http';
import { parseSitemap } from '../util/sitemap';

const ORIGIN = 'https://www.coursera.org';

interface CourseLd {
  '@type'?: string;
  name?: string;
  description?: string;
  provider?: { name?: string; url?: string };
  publisher?: { name?: string; url?: string };
  inLanguage?: string;
  hasCourseInstance?: Array<{ inLanguage?: string }>;
  offers?: { price?: number | string; priceCurrency?: string; category?: string };
}

/** `/learn/aws-certified-solutions-architect-associate` → words a matcher can read. */
function slugWords(url: string): string {
  const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '';
  return slug.replace(/-/g, ' ');
}

function readCourse(html: string): CourseLd | null {
  for (const block of extractLdJsonBlocks(html)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    // `/learn/…` puts the Course at the top level; `/specializations/…` and
    // `/professional-certificates/…` wrap it in an `@graph` instead.
    const entries = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => {
      const record = entry as { '@graph'?: unknown[] };
      return record && Array.isArray(record['@graph']) ? record['@graph'] : [entry];
    });

    for (const entry of entries) {
      const record = entry as CourseLd;
      if (record && record['@type'] === 'Course' && record.name) return record;
    }
  }
  return null;
}

/**
 * Coursera's search endpoint and its whole `/api/` tree are disallowed in
 * robots.txt, but the sitemaps and the course pages themselves are open. So
 * discovery runs off the sitemap: 25,543 URLs whose slugs already say what each
 * page teaches, matched against the certification dictionary before anything is
 * fetched. Credential pages come first — a professional certificate is a better
 * answer to "how do I prepare for this exam" than the 300th cloud course.
 */
export const courseraCrawler: CourseCrawler = {
  id: 'coursera',
  name: 'Coursera',
  url: ORIGIN,
  type: 'course-provider',

  isEnabled: (config) => config.sources.coursera.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Course[]> {
    const settings = config.sources.coursera;
    const lastChecked = now.toISOString();
    const courses: Course[] = [];

    // certificates → specializations → courses: most credential-shaped first.
    const candidates = new Map<string, string>();
    const perCert = new Map<string, number>();

    for (const name of settings.sitemaps) {
      let entries: Array<{ url: string }>;
      try {
        entries = parseSitemap(
          await fetchText(`${ORIGIN}/sitemap~www~${name}.xml`, {
            accept: 'application/xml,text/xml',
            timeoutMs: 90_000,
          }),
        ).entries;
      } catch (error) {
        log(`Coursera: sitemap "${name}" unreadable (${(error as Error).message})`);
        continue;
      }

      let matched = 0;
      for (const entry of entries) {
        const hits = countCertificationMentions(slugWords(entry.url), aliasIndex);
        for (const certificationId of hits.keys()) {
          const taken = perCert.get(certificationId) ?? 0;
          if (taken >= settings.coursesPerCert) continue;
          if (candidates.has(entry.url)) continue;
          candidates.set(entry.url, certificationId);
          perCert.set(certificationId, taken + 1);
          matched += 1;
        }
      }
      log(`Coursera: ${entries.length} urls in ${name}, ${matched} matched a certification`);
    }

    for (const [url, certificationId] of candidates) {
      if (courses.length >= settings.maxRecords) break;

      let html: string;
      try {
        html = await fetchText(url, { timeoutMs: 45_000, retries: 1 });
      } catch (error) {
        log(`Coursera: failed ${url} (${(error as Error).message})`);
        continue;
      }

      const data = readCourse(html);
      if (!data?.name) continue;

      const price = Number(data.offers?.price);
      courses.push({
        id: `coursera_${new URL(url).pathname.split('/').filter(Boolean).join('_')}`,
        certificationId,
        name: stripHtml(data.name),
        provider: {
          name: data.provider?.name || data.publisher?.name || 'Coursera',
          url: data.provider?.url || ORIGIN,
        },
        courseUrl: url,
        type: 'online-platform',
        location: { country: 'GLOBAL', market: 'global' },
        delivery: ['online'],
        // Coursera lists a subscription instead of a price on most pages; a
        // missing number stays missing rather than becoming a zero.
        language: data.inLanguage || data.hasCourseInstance?.[0]?.inLanguage || 'Unknown',
        price: Number.isFinite(price) ? price : null,
        currency: data.offers?.priceCurrency,
        lastChecked,
      });
    }

    log(`Coursera: ${courses.length} courses stored`);
    return courses.slice(0, settings.maxRecords);
  },
};
