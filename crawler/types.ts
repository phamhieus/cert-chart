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
  run(context: CrawlContext): Promise<T[]>;
}

export type JobCrawler = SourceCrawler<Job>;
export type CommunityCrawler = SourceCrawler<CommunityPost>;
export type CourseCrawler = SourceCrawler<Course>;
export type HolderCrawler = SourceCrawler<HolderReport>;

