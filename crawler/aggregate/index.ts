import type {
  Certification,
  CommunityPost,
  Course,
  DataSource,
  HolderReport,
  Job,
  Ranking,
} from '../../src/types';
import { parseTimestamp } from '../../src/utils/format';
import { buildRankings } from '../../src/utils/scoring';
import { DATA_FILES, readRecords, writeRecords } from '../store';

/**
 * Holder counts that the ranking is allowed to score on: only figures a vendor
 * published about one specific certification.
 *
 * Vendor-wide figures are deliberately excluded. "1.05 million unique AWS
 * Certified individuals" counts everyone holding any AWS exam; crediting it to
 * AWS SAA would invent a number nobody published. Those records are still
 * crawled and shown, just not scored. A certification with no published figure
 * keeps a null here and its holder weight is redistributed across the other
 * signals (see `src/utils/scoring.ts`), so it is not punished for the vendor's
 * silence.
 */
export function reportedHolders(reports: HolderReport[]): Record<string, number | null> {
  const byCertification: Record<string, number | null> = {};
  for (const report of reports) {
    if (report.scope !== 'certification' || !report.certificationId) continue;
    byCertification[report.certificationId] = report.holders;
  }
  return byCertification;
}

/** Latest crawl instant in the dataset: its own "now", so trends do not drift. */
export function datasetReferenceDate(sources: DataSource[], jobs: Job[]): Date {
  const latest = [...sources.map((s) => s.lastCrawledAt), ...jobs.map((j) => j.crawledAt)]
    .filter(Boolean)
    .sort()
    .at(-1);
  return parseTimestamp(latest) ?? new Date();
}

export interface AggregateResult {
  rankings: Ranking[];
  referenceDate: Date;
}

export function aggregate(): AggregateResult {
  const certifications = readRecords<Certification>(DATA_FILES.certifications);
  const jobs = readRecords<Job>(DATA_FILES.jobs);
  const community = readRecords<CommunityPost>(DATA_FILES.community);
  const courses = readRecords<Course>(DATA_FILES.courses);
  const sources = readRecords<DataSource>(DATA_FILES.sources);
  const holders = readRecords<HolderReport>(DATA_FILES.holders);
  const referenceDate = datasetReferenceDate(sources, jobs);

  const rankings = buildRankings({
    certifications,
    jobs,
    community,
    courses,
    reportedHolders: reportedHolders(holders),
    now: referenceDate,
  }).sort((a, b) => b.scores.overall - a.scores.overall);

  writeRecords(DATA_FILES.rankings, rankings);
  return { rankings, referenceDate };
}
