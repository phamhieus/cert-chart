export type MarketId = 'vietnam' | 'singapore' | 'japan' | 'global' | 'remote';

export interface MarketCity {
  id: string;
  name: string;
  market: MarketId;
}

export interface Market {
  id: MarketId;
  label: string;
  country: string;
  cities: MarketCity[];
}

/**
 * `national` = the record covers a whole market (typical for forum threads),
 * `unknown` = the source does not state a place. Never inferred from a user profile.
 */
export type LocationScope = 'national' | 'unknown';

export interface GeoLocation {
  country: string;
  market: MarketId;
  city?: string;
  scope?: LocationScope;
}

export type CertCategory =
  | 'Cloud'
  | 'Networking'
  | 'Cybersecurity'
  | 'DevOps'
  | 'Kubernetes'
  | 'Data'
  | 'AI'
  | 'Software Development'
  | 'Database'
  | 'Project Management';

export type CertLevel =
  | 'Foundational'
  | 'Associate'
  | 'Professional'
  | 'Expert'
  | 'Specialty';

export interface Certification {
  id: string;
  name: string;
  shortName: string;
  vendor: string;
  code: string | null;
  category: CertCategory;
  level: CertLevel;
  aliases: string[];
  officialUrl: string;
}

export type RequirementType = 'required' | 'preferred' | 'mentioned';

export interface JobCertificationRef {
  id: string;
  requirement: RequirementType;
}

export interface SourceRef {
  name: string;
  url: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: GeoLocation;
  certifications: JobCertificationRef[];
  source: SourceRef;
  /** Date the board published it (`YYYY-MM-DD`; that is all boards report). */
  postedAt: string;
  /** ISO-8601 instant this record was fetched. */
  crawledAt: string;
}

export interface CommunityPost {
  id: string;
  certificationId: string;
  source: SourceRef;
  title: string;
  location: GeoLocation;
  mentions: number;
  comments: number;
  views: number | null;
  reactions: number | null;
  uniqueAuthors: number | null;
  /** Date the thread was posted (`YYYY-MM-DD`). */
  publishedAt: string;
  /** ISO-8601 instant this record was fetched. */
  crawledAt: string;
}

export type CourseType = 'official' | 'training-center' | 'online-platform';

export type DeliveryMode = 'online' | 'offline';

export interface Course {
  id: string;
  certificationId: string;
  name: string;
  provider: SourceRef;
  courseUrl: string;
  type: CourseType;
  location: GeoLocation;
  delivery: DeliveryMode[];
  language: string;
  price: number | null;
  currency?: string;
  /** ISO-8601 instant the course page was last fetched. */
  lastChecked: string;
}

export interface RankingMetrics {
  jobs: number;
  requiredJobs: number;
  preferredJobs: number;
  mentionedJobs: number;
  communityPosts: number;
  communityMentions: number;
  communityComments: number;
  communityAuthors: number;
  courses: number;
  estimatedHolders: number | null;
  /** Null when the dataset does not reach far enough back to compare periods. */
  growth12m: number | null;
}

export interface RankingScores {
  jobDemand: number;
  community: number;
  /** Null when no source publishes a holder count; the weight is redistributed. */
  holders: number | null;
  /** Null when there is not enough history to measure growth. */
  growth: number | null;
  overall: number;
}

/** Monthly job/community counts, oldest first. */
export interface TrendPoint {
  month: string;
  jobs: number;
  community: number;
}

export interface Ranking {
  certificationId: string;
  metrics: RankingMetrics;
  scores: RankingScores;
  trend: TrendPoint[];
}

export type DataSourceType =
  | 'job-board'
  | 'community'
  | 'course-provider'
  | 'certification-body';

/**
 * A certified-population figure exactly as a vendor published it.
 *
 * `scope` is the part that matters. Vendors publish how many people hold *any*
 * of their certifications ("1.05 million unique AWS Certified individuals") far
 * more often than a per-exam number, and the two must never be conflated — only
 * a `certification` figure is a count of people holding that one credential.
 * `statement` keeps the published sentence so any number on screen can be
 * checked against its source.
 */
export interface HolderReport {
  id: string;
  /** Null when the figure covers the vendor rather than one certification. */
  certificationId: string | null;
  vendor: string;
  holders: number;
  /**
   * Whether the figure counts people or credentials issued. One person can hold
   * several exams, so "4 million certifications issued" is not four million
   * people.
   */
  counts: 'people' | 'certifications';
  scope: 'certification' | 'vendor';
  statement: string;
  source: SourceRef;
  /** ISO-8601 instant this figure was read off the page. */
  crawledAt: string;
}

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  url: string;
  /** ISO-8601 instant the last successful crawl of this source finished. */
  lastCrawledAt: string;
  /** ISO-8601 instant that same crawl started. */
  lastCrawlStartedAt?: string;
  /** Wall-clock duration of that crawl, in milliseconds. */
  lastCrawlDurationMs?: number;
  records: number;
  notes?: string;
}

export type PeriodKey = '30d' | '90d' | '6m' | '12m' | '24m' | '36m' | 'all';

/** `all` = every market, otherwise a market id, a city id, or a scope bucket. */
export type RegionFilterValue = 'all' | MarketId | LocationScope | string;

export interface DashboardFilters {
  region: RegionFilterValue;
  category: CertCategory | 'all';
  period: PeriodKey;
  search: string;
}

export type TrendDirection = 'up' | 'down' | 'flat';

/** A ranking row joined with its certification and derived display values. */
export interface RankedCertification {
  rank: number;
  certification: Certification;
  metrics: RankingMetrics;
  scores: RankingScores;
  trend: TrendPoint[];
  direction: TrendDirection;
}

export type ModalTab = 'overview' | 'jobs' | 'community' | 'courses';

export interface CrawlSourceOutcome {
  id: string;
  name: string;
  url: string;
  type: DataSourceType;
  records: number;
  status: 'ok' | 'failed' | 'skipped';
  error?: string;
  /** ISO-8601 instants, not dates: the dashboard reports the exact clock time. */
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface CrawlProgress {
  state: 'idle' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  currentSource?: string;
  completed: number;
  total: number;
  outcomes: CrawlSourceOutcome[];
  messages: string[];
  error?: string;
}

export interface DatasetSummary {
  certifications: number;
  jobs: number;
  community: number;
  courses: number;
  rankings: number;
  /** ISO-8601 instant of the most recent successful source crawl. */
  lastCrawledAt: string | null;
  isEmpty: boolean;
}
