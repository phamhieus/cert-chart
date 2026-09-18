import {
  COMMUNITY_WEIGHTS,
  GROWTH_SCORE_CLAMP,
  RANKING_WEIGHTS,
  REQUIREMENT_WEIGHTS,
  TREND_FLAT_THRESHOLD,
} from '../constants/ranking';
import type {
  Certification,
  CommunityPost,
  Course,
  Job,
  RankedCertification,
  Ranking,
  RequirementType,
  TrendDirection,
  TrendPoint,
} from '../types';

/**
 * Three years of trend, because a certification's rise or fall is not visible in
 * one. `growth12m` deliberately stays a 12-month measure over the tail of this
 * series — widening the trend must not silently redefine the growth metric.
 */
export const TREND_MONTHS = 36;

/** Months compared by `growth12m`: the last 6 against the 6 before them. */
export const GROWTH_WINDOW_MONTHS = 12;

export function monthKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function lastMonthKeys(now: Date, count = TREND_MONTHS): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(monthKey(d));
  }
  return keys;
}

/** Log scale keeps a single dominant certification from flattening the rest. */
export function logNormalize(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return (Math.log1p(value) / Math.log1p(max)) * 100;
}

export function jobDemandRaw(counts: Record<RequirementType, number>): number {
  return (
    counts.required * REQUIREMENT_WEIGHTS.required +
    counts.preferred * REQUIREMENT_WEIGHTS.preferred +
    counts.mentioned * REQUIREMENT_WEIGHTS.mentioned
  );
}

/**
 * Percentage change between the two halves of a series. Null when the older half
 * is empty: a freshly seeded dataset would otherwise report +100% everywhere.
 */
export function halfOverHalfGrowth(series: number[]): number | null {
  const mid = Math.floor(series.length / 2);
  const older = series.slice(0, mid).reduce((a, b) => a + b, 0);
  const recent = series.slice(mid).reduce((a, b) => a + b, 0);
  if (older === 0) return null;
  return ((recent - older) / older) * 100;
}

export function growthScore(growthPercent: number): number {
  const clamped = Math.max(-GROWTH_SCORE_CLAMP, Math.min(GROWTH_SCORE_CLAMP, growthPercent));
  return ((clamped + GROWTH_SCORE_CLAMP) / (2 * GROWTH_SCORE_CLAMP)) * 100;
}

export function trendDirection(growthPercent: number | null): TrendDirection {
  if (growthPercent === null) return 'flat';
  if (growthPercent > TREND_FLAT_THRESHOLD) return 'up';
  if (growthPercent < -TREND_FLAT_THRESHOLD) return 'down';
  return 'flat';
}

export interface RankingInput {
  certifications: Certification[];
  jobs: Job[];
  community: CommunityPost[];
  courses: Course[];
  /** Source-reported holder counts keyed by certification id, when available. */
  reportedHolders?: Record<string, number | null>;
  now?: Date;
}

interface Accumulator {
  requirements: Record<RequirementType, number>;
  jobs: number;
  posts: number;
  mentions: number;
  comments: number;
  authors: number;
  engagement: number;
  courses: number;
  jobsByMonth: Map<string, number>;
  communityByMonth: Map<string, number>;
  mentionsByMonth: Map<string, number>;
}

function emptyAccumulator(): Accumulator {
  return {
    requirements: { required: 0, preferred: 0, mentioned: 0 },
    jobs: 0,
    posts: 0,
    mentions: 0,
    comments: 0,
    authors: 0,
    engagement: 0,
    courses: 0,
    jobsByMonth: new Map(),
    communityByMonth: new Map(),
    mentionsByMonth: new Map(),
  };
}

function bump(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function buildRankings(input: RankingInput): Ranking[] {
  const now = input.now ?? new Date();
  const months = lastMonthKeys(now);
  const accumulators = new Map<string, Accumulator>(
    input.certifications.map((cert) => [cert.id, emptyAccumulator()]),
  );

  for (const job of input.jobs) {
    const month = monthKey(job.postedAt);
    for (const ref of job.certifications) {
      const acc = accumulators.get(ref.id);
      if (!acc) continue;
      acc.requirements[ref.requirement] += 1;
      acc.jobs += 1;
      bump(acc.jobsByMonth, month);
    }
  }

  for (const post of input.community) {
    const acc = accumulators.get(post.certificationId);
    if (!acc) continue;
    const month = monthKey(post.publishedAt);
    acc.posts += 1;
    acc.mentions += post.mentions;
    acc.comments += post.comments;
    acc.authors += post.uniqueAuthors ?? 0;
    acc.engagement += (post.reactions ?? 0) + (post.views ?? 0) / 100;
    bump(acc.communityByMonth, month);
    bump(acc.mentionsByMonth, month, post.mentions);
  }

  for (const course of input.courses) {
    const acc = accumulators.get(course.certificationId);
    if (acc) acc.courses += 1;
  }

  const derived = input.certifications.map((cert) => {
    const acc = accumulators.get(cert.id)!;
    const jobSeries = months.map((m) => acc.jobsByMonth.get(m) ?? 0);
    const communitySeries = months.map((m) => acc.communityByMonth.get(m) ?? 0);
    const mentionSeries = months.map((m) => acc.mentionsByMonth.get(m) ?? 0);
    const demandSeries = jobSeries.map((value, i) => value + communitySeries[i]);
    return {
      cert,
      acc,
      demandRaw: jobDemandRaw(acc.requirements),
      growth12m: halfOverHalfGrowth(demandSeries.slice(-GROWTH_WINDOW_MONTHS)),
      communityGrowth: halfOverHalfGrowth(communitySeries.slice(-GROWTH_WINDOW_MONTHS)),
      reportedHolders: input.reportedHolders?.[cert.id] ?? null,
      trend: months.map<TrendPoint>((month, i) => ({
        month,
        jobs: jobSeries[i],
        community: mentionSeries[i],
      })),
    };
  });

  const max = {
    demand: Math.max(0, ...derived.map((d) => d.demandRaw)),
    posts: Math.max(0, ...derived.map((d) => d.acc.posts)),
    authors: Math.max(0, ...derived.map((d) => d.acc.authors)),
    comments: Math.max(0, ...derived.map((d) => d.acc.comments)),
    engagement: Math.max(0, ...derived.map((d) => d.acc.engagement)),
    holders: Math.max(0, ...derived.map((d) => d.reportedHolders ?? 0)),
  };

  return derived.map(({ cert, acc, demandRaw, growth12m, communityGrowth, reportedHolders, trend }) => {
    const jobDemand = logNormalize(demandRaw, max.demand);
    const community = weightedAverage([
      [COMMUNITY_WEIGHTS.posts, logNormalize(acc.posts, max.posts)],
      [COMMUNITY_WEIGHTS.authors, logNormalize(acc.authors, max.authors)],
      [COMMUNITY_WEIGHTS.comments, logNormalize(acc.comments, max.comments)],
      [COMMUNITY_WEIGHTS.engagement, logNormalize(acc.engagement, max.engagement)],
      [COMMUNITY_WEIGHTS.growth, communityGrowth === null ? null : growthScore(communityGrowth)],
    ]);
    const holders = reportedHolders === null ? null : logNormalize(reportedHolders, max.holders);
    const growth = growth12m === null ? null : growthScore(growth12m);

    // Signals nobody publishes (holder counts) or that the dataset cannot support
    // yet (growth without history) drop out instead of being guessed; their
    // weight is redistributed across the signals that do have data.
    const overall = weightedAverage([
      [RANKING_WEIGHTS.jobs, jobDemand],
      [RANKING_WEIGHTS.community, community],
      [RANKING_WEIGHTS.holders, holders],
      [RANKING_WEIGHTS.growth, growth],
    ]);

    return {
      certificationId: cert.id,
      metrics: {
        jobs: acc.jobs,
        requiredJobs: acc.requirements.required,
        preferredJobs: acc.requirements.preferred,
        mentionedJobs: acc.requirements.mentioned,
        communityPosts: acc.posts,
        communityMentions: acc.mentions,
        communityComments: acc.comments,
        communityAuthors: acc.authors,
        courses: acc.courses,
        estimatedHolders: reportedHolders,
        growth12m: growth12m === null ? null : round(growth12m, 1),
      },
      scores: {
        jobDemand: Math.round(jobDemand),
        community: Math.round(community),
        holders: holders === null ? null : Math.round(holders),
        growth: growth === null ? null : Math.round(growth),
        overall: round(overall, 1),
      },
      trend,
    } satisfies Ranking;
  });
}

/** Averages the components that have a value, renormalising over their weights. */
function weightedAverage(components: Array<[number, number | null]>): number {
  const available = components.filter((entry): entry is [number, number] => entry[1] !== null);
  const weightSum = available.reduce((sum, [weight]) => sum + weight, 0);
  if (weightSum === 0) return 0;
  return available.reduce((sum, [weight, value]) => sum + weight * value, 0) / weightSum;
}

export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Joins rankings with certifications and assigns ranks by overall score. */
export function rankCertifications(
  rankings: Ranking[],
  certificationsById: Map<string, Certification>,
): RankedCertification[] {
  return rankings
    .filter((ranking) => certificationsById.has(ranking.certificationId))
    .sort((a, b) => b.scores.overall - a.scores.overall)
    .map((ranking, index) => ({
      rank: index + 1,
      certification: certificationsById.get(ranking.certificationId)!,
      metrics: ranking.metrics,
      scores: ranking.scores,
      trend: ranking.trend,
      direction: trendDirection(ranking.metrics.growth12m),
    }));
}
