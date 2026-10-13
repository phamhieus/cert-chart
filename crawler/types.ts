import type {
  Certification,
  CommunityPost,
  Course,
  CrawlProgress,
  CrawlSourceOutcome,
  DataSourceType,
  HolderReport,
  Job,
  MarketId,
} from '../src/types';
import type { AliasIndex } from '../src/utils/certAliases';
import type { CrawlConfig } from './config';

export type { CrawlProgress };
export type SourceOutcome = CrawlSourceOutcome;

/**
 * One posting a job crawler looked at, reported whether or not it named a
 * certification. Only crawlers that enumerate a board's listing may report
 * these — see `observeRole`.
 */
export interface RoleObservation {
  /** The crawler's `source.name`, so buckets match the Data sources dialog. */
  source: string;
  /** The posting title; roles are read from the title alone. */
  title: string;
  market: MarketId;
  /** `YYYY-MM-DD`; the crawl date is used when the board publishes none. */
  postedAt?: string | null;
  matchedCertification: boolean;
}

export interface CrawlContext {
  config: CrawlConfig;
  certifications: Certification[];
  aliasIndex: AliasIndex;
  now: Date;
  log: (message: string) => void;
  /**
   * Counts a posting towards role demand. Call it for **every** posting the
   * crawler enumerates, before the `certifications.length === 0` filter —
   * that filter is what makes `Job` records unusable for measuring roles.
   *
   * Only call it from a crawler that walks a board's full listing. A crawler
   * that searches per certification (TopCV, CareerViet, MyCareersFuture) sees
   * a population already filtered by certification, so its role counts would
   * describe the query rather than the market.
   */
  observeRole: (observation: RoleObservation) => void;
}

export interface SourceCrawler<T> {
  id: string;
  name: string;
  url: string;
  type: DataSourceType;
  isEnabled(config: CrawlConfig): boolean;
  /** Shown instead of a generic "disabled" note when the source is skipped. */
  skipReason?(config: CrawlConfig): string;
  /**
   * Replace the stored file with this run's records instead of merging them.
   * For a source that re-reads every target on every run, the run is
   * authoritative — and merging would strand a figure that a later, stricter
   * pass has already rejected, because a rejection produces no record to
   * overwrite it with. Sources that accumulate over time (job boards, forums)
   * leave this off.
   */
  replaces?: boolean;
  run(context: CrawlContext): Promise<T[]>;
}

export type JobCrawler = SourceCrawler<Job>;
export type CommunityCrawler = SourceCrawler<CommunityPost>;
export type CourseCrawler = SourceCrawler<Course>;
export type HolderCrawler = SourceCrawler<HolderReport>;

