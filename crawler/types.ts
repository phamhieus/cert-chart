import type {
  Certification,
  CommunityPost,
  Course,
  CrawlProgress,
  CrawlSourceOutcome,
  DataSourceType,
  HolderReport,
  Job,
} from '../src/types';
import type { AliasIndex } from '../src/utils/certAliases';
import type { CrawlConfig } from './config';

export type { CrawlProgress };
export type SourceOutcome = CrawlSourceOutcome;

export interface CrawlContext {
  config: CrawlConfig;
  certifications: Certification[];
  aliasIndex: AliasIndex;
  now: Date;
  log: (message: string) => void;
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

