import type { CertificationId } from './certifications';

export type CertStatRow = {
  id: CertificationId;
  /** Canonical certification name — every alias normalises to this. */
  name: string;
  shortName: string;
  vendor: string;
  /** posts + comments that mentioned this certification at least once. */
  total: number;
  posts: number;
  comments: number;
  last7: number;
  last30: number;
  /**
   * Percent change of the last 7 days against the 7 days before that.
   * `null` means there is no baseline (the previous window was empty), which
   * the dashboard renders as "new" or "—" depending on `last7`.
   */
  trendPct: number | null;
};

export type StatsResponse = {
  type: 'stats';
  subreddit: string;
  generatedAt: string;
  totalMentions: number;
  rows: CertStatRow[];
  scan: {
    backfillComplete: boolean;
    oldestScannedAt: string | null;
    lastSyncAt: string | null;
  };
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
