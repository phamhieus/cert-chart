import * as cheerio from 'cheerio';
import type { Course, DeliveryMode } from '../../src/types';
import { normalizeText } from '../../src/utils/certAliases';
import { countCertificationMentions } from '../normalize/certifications';
import type { CourseCrawler, CrawlContext } from '../types';
import { fetchText } from '../util/http';

interface Candidate {
  certificationId: string;
  centerId: string;
  centerName: string;
  centerUrl: string;
  label: string;
}

/** Only what the page itself says; nothing is assumed about how a centre teaches. */
function deliveryFrom(text: string): DeliveryMode[] {
  const normalized = normalizeText(text);
  const modes: DeliveryMode[] = [];
  if (/\bonline\b|truc tuyen|tu xa/.test(normalized)) modes.push('online');
  if (/\boffline\b|tai trung tam|tap trung|truc tiep/.test(normalized)) modes.push('offline');
  return modes;
}

function titleOf(html: string, fallback: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const cleaned = title?.replace(/\s+/g, ' ').trim();
  return cleaned && cleaned.length > 3 ? cleaned : fallback;
}

/** `<html lang="vi">` is a statement by the site, unlike guessing from the domain. */
function languageOf(html: string): string {
  const lang = /<html[^>]*\blang=["']([a-zA-Z-]+)["']/i.exec(html)?.[1]?.toLowerCase();
  if (!lang) return 'Unknown';
  if (lang.startsWith('vi')) return 'Vietnamese';
  if (lang.startsWith('en')) return 'English';
  return lang;
}

/**
 * Vietnamese training centres have no aggregator and no feed, so each one is
 * listed explicitly in `crawler/config.ts` with the pages that actually carry
 * its catalogue — every entry in that list was checked to serve a course list
 * naming tracked certifications. Courses are discovered from link text, then the
 * course page is fetched to confirm it resolves, exactly like the official
 * vendor crawler. Prices stay null: centres publish "liên hệ báo giá", not
 * numbers, and a placeholder price would be worse than no price.
 */
export const vnTrainingCentersCrawler: CourseCrawler = {
  id: 'vn-training-centers',
  name: 'Vietnamese training centres',
  url: '',
  type: 'course-provider',

  isEnabled: (config) => config.sources.trainingCenters.enabled,

  async run({ config, aliasIndex, now, log }: CrawlContext): Promise<Course[]> {
    const settings = config.sources.trainingCenters;
    const lastChecked = now.toISOString();
    const candidates = new Map<string, Candidate>();

    for (const center of settings.centers) {
      let found = 0;

      for (const listUrl of center.listUrls) {
        let html: string;
        try {
          html = await fetchText(listUrl, { timeoutMs: 40_000, retries: 1 });
        } catch (error) {
          log(`${center.name}: ${listUrl} unreachable (${(error as Error).message})`);
          continue;
        }

        const $ = cheerio.load(html);
        for (const element of $('a[href]').toArray()) {
          const anchor = $(element);
          const label = anchor.text().replace(/\s+/g, ' ').trim();
          const href = anchor.attr('href');
          if (!href || label.length < 4) continue;

          let courseUrl: string;
          try {
            courseUrl = new URL(href, listUrl).toString();
          } catch {
            continue;
          }
          // Stay on the centre's own site; anchors also point at Facebook, Zalo…
          if (new URL(courseUrl).hostname !== new URL(listUrl).hostname) continue;

          for (const certificationId of countCertificationMentions(label, aliasIndex).keys()) {
            if (candidates.has(courseUrl)) continue;
            candidates.set(courseUrl, {
              certificationId,
              centerId: center.id,
              centerName: center.name,
              centerUrl: center.url,
              label,
            });
            found += 1;
          }
        }
      }

      log(`${center.name}: ${found} course links naming a tracked certification`);
    }

    const courses: Course[] = [];
    for (const [courseUrl, candidate] of candidates) {
      if (courses.length >= settings.maxCoursePages) break;

      let html: string;
      try {
        html = await fetchText(courseUrl, { timeoutMs: 40_000, retries: 1 });
      } catch (error) {
        log(`${candidate.centerName}: ${courseUrl} unreachable (${(error as Error).message})`);
        continue;
      }

      const slug = new URL(courseUrl).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      courses.push({
        id: `vncenter_${candidate.centerId}_${slug}`.slice(0, 120),
        certificationId: candidate.certificationId,
        name: titleOf(html, candidate.label),
        provider: { name: candidate.centerName, url: candidate.centerUrl },
        courseUrl,
        type: 'training-center',
        // City is not claimed: a centre with several branches states none here.
        location: { country: 'VN', market: 'vietnam' },
        delivery: deliveryFrom(`${candidate.label} ${html.slice(0, 20_000)}`),
        language: languageOf(html),
        price: null,
        lastChecked,
      });
    }

    log(`Vietnamese training centres: ${courses.length} courses verified live`);
    return courses.slice(0, settings.maxRecords);
  },
};
