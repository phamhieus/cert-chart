import type { PeriodKey, RequirementType } from '../types';

/** Overall score composition. Must sum to 1. */
export const RANKING_WEIGHTS = {
  jobs: 0.35,
  community: 0.3,
  holders: 0.2,
  growth: 0.15,
} as const;

/** How strongly a certification mention inside a job posting counts. */
export const REQUIREMENT_WEIGHTS: Record<RequirementType, number> = {
  required: 1,
  preferred: 0.6,
  mentioned: 0.2,
};

/** Community score composition. Must sum to 1. */
export const COMMUNITY_WEIGHTS = {
  posts: 0.3,
  authors: 0.3,
  comments: 0.2,
  engagement: 0.1,
  growth: 0.1,
} as const;

/** Growth of +/- this percentage maps to the extremes of the growth score. */
export const GROWTH_SCORE_CLAMP = 60;

export const TREND_FLAT_THRESHOLD = 2;

export const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '12m': 365,
  '24m': 730,
  '36m': 1_095,
  all: null,
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
  '24m': 'Last 24 months',
  '36m': 'Last 36 months',
  all: 'All time',
};

export const CATEGORIES = [
  'Cloud',
  'Networking',
  'Cybersecurity',
  'DevOps',
  'Kubernetes',
  'Data',
  'AI',
  'Software Development',
  'Database',
  'Project Management',
] as const;

export const REQUIREMENT_LABELS: Record<RequirementType, string> = {
  required: 'Required',
  preferred: 'Preferred',
  mentioned: 'Mentioned',
};
