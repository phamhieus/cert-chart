import type { Course } from '../../src/types';
import type { CourseCrawler, CrawlContext } from '../types';
import { fetchText } from '../util/http';

/** Official training platform per vendor — curated reference data, not scraped. */
const PLATFORMS: Record<string, { name: string; url: string }> = {
  AWS: { name: 'AWS Skill Builder', url: 'https://skillbuilder.aws' },
  Microsoft: { name: 'Microsoft Learn', url: 'https://learn.microsoft.com' },
  Cisco: { name: 'Cisco Learning Network', url: 'https://learningnetwork.cisco.com' },
  'Linux Foundation / CNCF': {
    name: 'Linux Foundation Training',
    url: 'https://training.linuxfoundation.org',
  },
  'Google Cloud': {
    name: 'Google Cloud Skills Boost',
    url: 'https://www.cloudskillsboost.google',
  },
  HashiCorp: { name: 'HashiCorp Developer', url: 'https://developer.hashicorp.com' },
  Oracle: { name: 'Oracle University', url: 'https://education.oracle.com' },
  CompTIA: { name: 'CompTIA Learning', url: 'https://www.comptia.org/training' },
  ISC2: { name: 'ISC2 Official Training', url: 'https://www.isc2.org/training' },
  'EC-Council': { name: 'EC-Council Training', url: 'https://www.eccouncil.org' },
  PMI: { name: 'PMI Training', url: 'https://www.pmi.org/learning' },
  'Scrum.org': { name: 'Scrum.org Courses', url: 'https://www.scrum.org/courses' },
};

/**
 * Publishes the official learning path for each certification and verifies the
 * link still resolves. Prices are left null: vendors do not publish a single
 * course price per certification.
 */
export const officialCoursesCrawler: CourseCrawler = {
  id: 'official-training',
  name: 'Official vendor training',
  // Aggregate of the vendor platforms below — no single site of its own.
  url: '',
  type: 'course-provider',

  isEnabled: (config) => config.sources.officialCourses.enabled,

  async run({ certifications, now, log }: CrawlContext): Promise<Course[]> {
    const lastChecked = now.toISOString();
    const courses: Course[] = [];
    let unreachable = 0;

    for (const cert of certifications) {
      const platform = PLATFORMS[cert.vendor];
      if (!platform) continue;

      try {
        await fetchText(cert.officialUrl);
      } catch (error) {
        unreachable += 1;
        log(`Official courses: ${cert.shortName} link unreachable (${(error as Error).message})`);
        continue;
      }

      courses.push({
        id: `official_${cert.id}`,
        certificationId: cert.id,
        name: `${cert.shortName} — official learning path`,
        provider: platform,
        courseUrl: cert.officialUrl,
        type: 'official',
        location: { country: 'GLOBAL', market: 'global' },
        delivery: ['online'],
        language: 'English',
        price: null,
        lastChecked,
      });
    }

    log(`Official courses: ${courses.length} verified, ${unreachable} unreachable`);
    return courses;
  },
};
