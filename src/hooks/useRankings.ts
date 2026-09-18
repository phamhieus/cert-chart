import { useMemo } from 'react';
import type { Dataset } from '../services/dataRepository';
import type {
  CommunityPost,
  Course,
  DashboardFilters,
  Job,
  RankedCertification,
} from '../types';
import { matchesQuery } from '../utils/certAliases';
import { filterCommunity, filterCourses, filterJobs } from '../utils/filters';
import { buildRankings, rankCertifications } from '../utils/scoring';

export interface RankingTotals {
  certifications: number;
  jobs: number;
  communityMentions: number;
  courses: number;
}

/** The records behind the totals, narrowed to what the current filters show. */
export interface RankingRecords {
  jobs: Job[];
  community: CommunityPost[];
  courses: Course[];
}

export interface RankingView {
  rows: RankedCertification[];
  totals: RankingTotals;
  records: RankingRecords;
  /** True when scores were recomputed in the browser instead of read from rankings.json. */
  recomputed: boolean;
}

/**
 * Uses the pre-aggregated rankings for the default view and only recomputes when
 * a region or period filter narrows the dataset.
 */
export function useRankings(dataset: Dataset | null, filters: DashboardFilters): RankingView {
  const recomputed = filters.region !== 'all' || filters.period !== 'all';

  const scored = useMemo<RankedCertification[]>(() => {
    if (!dataset) return [];
    if (!recomputed) {
      return rankCertifications(dataset.rankings, dataset.certificationsById);
    }

    const now = dataset.datasetNow;
    const rankings = buildRankings({
      certifications: dataset.certifications,
      jobs: filterJobs(dataset.jobs, { region: filters.region, period: filters.period, now }),
      community: filterCommunity(dataset.community, { period: filters.period, now }),
      courses: filterCourses(dataset.courses, { region: filters.region }),
      // Holder counts are a global published total, not a per-market figure, so
      // they survive a region or period filter unchanged. Dropping them here
      // would make the holder score vanish the moment anyone filters.
      reportedHolders: Object.fromEntries(
        [...dataset.holdersByCertification].map(([id, report]) => [id, report.holders]),
      ),
      now,
    });
    return rankCertifications(rankings, dataset.certificationsById);
  }, [dataset, recomputed, filters.region, filters.period]);

  // Always narrowed by the same filters the scores used, so the evidence lists
  // agree with the numbers on the tiles. Community records skip the region
  // filter on purpose — see filterCommunity.
  const scoped = useMemo<RankingRecords>(() => {
    if (!dataset) return { jobs: [], community: [], courses: [] };
    const now = dataset.datasetNow;
    return {
      jobs: filterJobs(dataset.jobs, { region: filters.region, period: filters.period, now }),
      community: filterCommunity(dataset.community, { period: filters.period, now }),
      courses: filterCourses(dataset.courses, { region: filters.region }),
    };
  }, [dataset, filters.region, filters.period]);

  return useMemo<RankingView>(() => {
    const rows = scored
      .filter((row) => filters.category === 'all' || row.certification.category === filters.category)
      .filter((row) => matchesQuery(row.certification, filters.search))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    // A category or search filter hides certifications; their records go too.
    const visible = new Set(rows.map((row) => row.certification.id));
    const records: RankingRecords = {
      jobs: scoped.jobs.filter((job) => job.certifications.some((ref) => visible.has(ref.id))),
      community: scoped.community.filter((post) => visible.has(post.certificationId)),
      courses: scoped.courses.filter((course) => visible.has(course.certificationId)),
    };

    return {
      rows,
      recomputed,
      records,
      totals: {
        certifications: rows.length,
        jobs: rows.reduce((sum, row) => sum + row.metrics.jobs, 0),
        communityMentions: rows.reduce((sum, row) => sum + row.metrics.communityMentions, 0),
        courses: rows.reduce((sum, row) => sum + row.metrics.courses, 0),
      },
    };
  }, [scored, scoped, filters.category, filters.search, recomputed]);
}
