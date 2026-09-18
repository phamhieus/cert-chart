import { PERIOD_DAYS } from '../constants/ranking';
import type {
  CommunityPost,
  Course,
  CourseType,
  DeliveryMode,
  Job,
  PeriodKey,
  RegionFilterValue,
  RequirementType,
} from '../types';
import { normalizeText } from './certAliases';
import { matchesRegion } from './regions';

export function periodStart(period: PeriodKey, now: Date): number | null {
  const days = PERIOD_DAYS[period];
  if (days === null) return null;
  return now.getTime() - days * 86_400_000;
}

export function withinPeriod(date: string, period: PeriodKey, now: Date): boolean {
  const start = periodStart(period, now);
  if (start === null) return true;
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? true : time >= start;
}

export function jobRequirement(job: Job, certificationId: string): RequirementType | null {
  return job.certifications.find((c) => c.id === certificationId)?.requirement ?? null;
}

export interface JobFilter {
  certificationId?: string;
  region: RegionFilterValue;
  period: PeriodKey;
  requirement?: RequirementType | 'all';
  source?: string;
  search?: string;
  now: Date;
}

export function filterJobs(jobs: Job[], filter: JobFilter): Job[] {
  const query = filter.search ? normalizeText(filter.search) : '';

  return jobs.filter((job) => {
    if (filter.certificationId) {
      const requirement = jobRequirement(job, filter.certificationId);
      if (!requirement) return false;
      if (filter.requirement && filter.requirement !== 'all' && requirement !== filter.requirement) {
        return false;
      }
    }
    if (!matchesRegion(job.location, filter.region, { includeNational: false })) return false;
    if (!withinPeriod(job.postedAt, filter.period, filter.now)) return false;
    if (filter.source && filter.source !== 'all' && job.source.name !== filter.source) return false;
    if (query) {
      const haystack = normalizeText(`${job.title} ${job.company}`);
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export interface CommunityFilter {
  certificationId?: string;
  period: PeriodKey;
  source?: string;
  search?: string;
  now: Date;
}

/**
 * Community discussion is never narrowed by region. A GitHub repo, a Stack
 * Overflow question or a Zenn article states no author location, so filtering
 * them by market would drop the entire corpus the moment a reader picks one —
 * and a thread about AZ-104 is evidence of interest in AZ-104 wherever it was
 * written. Region stays a filter for jobs and training centres, which do carry
 * a place.
 */
export function filterCommunity(posts: CommunityPost[], filter: CommunityFilter): CommunityPost[] {
  const query = filter.search ? normalizeText(filter.search) : '';

  return posts.filter((post) => {
    if (filter.certificationId && post.certificationId !== filter.certificationId) return false;
    if (!withinPeriod(post.publishedAt, filter.period, filter.now)) return false;
    if (filter.source && filter.source !== 'all' && post.source.name !== filter.source) return false;
    if (query && !normalizeText(post.title).includes(query)) return false;
    return true;
  });
}

export type PriceFilter = 'all' | 'free' | 'paid';

export interface CourseFilter {
  certificationId?: string;
  region: RegionFilterValue;
  type?: CourseType | 'all';
  delivery?: DeliveryMode | 'all';
  language?: string;
  price?: PriceFilter;
  search?: string;
}

/**
 * Online platform courses stay visible for every region: they are not bound to
 * a place, so filtering them out by province would hide valid options.
 */
export function filterCourses(courses: Course[], filter: CourseFilter): Course[] {
  const query = filter.search ? normalizeText(filter.search) : '';

  return courses.filter((course) => {
    if (filter.certificationId && course.certificationId !== filter.certificationId) return false;
    if (filter.type && filter.type !== 'all' && course.type !== filter.type) return false;
    if (filter.delivery && filter.delivery !== 'all' && !course.delivery.includes(filter.delivery)) {
      return false;
    }
    if (filter.language && filter.language !== 'all' && course.language !== filter.language) {
      return false;
    }
    if (filter.price === 'free' && !(course.price === 0)) return false;
    if (filter.price === 'paid' && !(typeof course.price === 'number' && course.price > 0)) {
      return false;
    }
    const placeBound = course.type === 'training-center';
    if (placeBound && !matchesRegion(course.location, filter.region, { includeNational: false })) {
      return false;
    }
    if (query) {
      const haystack = normalizeText(`${course.name} ${course.provider.name}`);
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function uniqueSourceNames(items: Array<{ source: { name: string } }>): string[] {
  return [...new Set(items.map((item) => item.source.name))].sort((a, b) => a.localeCompare(b));
}
