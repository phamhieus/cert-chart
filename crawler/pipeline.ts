import type {
  CommunityPost,
  Course,
  DataSource,
  HolderReport,
  Job,
  RoleDemand,
  RoleId,
} from '../src/types';
import { aggregate } from './aggregate/index';
import { dayNhauHocCrawler } from './communities/daynhauhoc';
import { deepSeekCrawler } from './communities/deepseek';
import { devToCrawler } from './communities/devto';
import { gitHubCrawler } from './communities/github';
import { mediumCrawler } from './communities/medium';
import { quanTriMangCrawler } from './communities/quantrimang';
import { redditCrawler } from './communities/reddit';
import { stackOverflowCrawler } from './communities/stackoverflow';
import { vibloCrawler } from './communities/viblo';
import { vozCrawler } from './communities/voz';
import { zennCrawler } from './communities/zenn';
import { CRAWL_CONFIG } from './config';
import { courseraCrawler } from './courses/coursera';
import { officialCoursesCrawler } from './courses/official';
import { udemyCrawler } from './courses/udemy';
import { vnTrainingCentersCrawler } from './courses/vntrainingcenters';
import { arbeitnowCrawler } from './jobs/arbeitnow';
import { vendorHoldersCrawler } from './holders/vendorPages';
import { careerVietCrawler } from './jobs/careerviet';
import { greenhouseCrawler } from './jobs/greenhouse';
import { himalayasCrawler } from './jobs/himalayas';
import { itviecCrawler } from './jobs/itviec';
import { linkedInCrawler } from './jobs/linkedin';
import { myCareersFutureCrawler } from './jobs/mycareersfuture';
import { remoteOkCrawler } from './jobs/remoteok';
import { remotiveCrawler } from './jobs/remotive';
import { tokyoDevCrawler } from './jobs/tokyodev';
import { topCvCrawler } from './jobs/topcv';
import { vieclam24hCrawler } from './jobs/vieclam24h';
import { weWorkRemotelyCrawler } from './jobs/weworkremotely';
import { createAliasIndex, loadCertifications } from './normalize/certifications';
import { ROLE_IDS, detectRoles } from './normalize/roles';
import { DATA_FILES, mergeById, readRecords, writeRecords } from './store';
import type {
  CrawlContext,
  CrawlProgress,
  RoleObservation,
  SourceCrawler,
  SourceOutcome,
} from './types';

const JOB_CRAWLERS = [
  itviecCrawler,
  topCvCrawler,
  careerVietCrawler,
  vieclam24hCrawler,
  myCareersFutureCrawler,
  tokyoDevCrawler,
  weWorkRemotelyCrawler,
  remoteOkCrawler,
  remotiveCrawler,
  arbeitnowCrawler,
  himalayasCrawler,
  greenhouseCrawler,
  linkedInCrawler,
];
const COMMUNITY_CRAWLERS = [
  dayNhauHocCrawler,
  vibloCrawler,
  zennCrawler,
  stackOverflowCrawler,
  gitHubCrawler,
  devToCrawler,
  mediumCrawler,
  redditCrawler,
  vozCrawler,
  quanTriMangCrawler,
  deepSeekCrawler,
];
const COURSE_CRAWLERS = [
  officialCoursesCrawler,
  courseraCrawler,
  udemyCrawler,
  vnTrainingCentersCrawler,
];
const HOLDER_CRAWLERS = [vendorHoldersCrawler];

export const ALL_CRAWLERS = [
  ...JOB_CRAWLERS,
  ...COMMUNITY_CRAWLERS,
  ...COURSE_CRAWLERS,
  ...HOLDER_CRAWLERS,
];

export interface RunCrawlOptions {
  /** Restrict the run to these crawler ids. */
  only?: string[];
  onProgress?: (progress: CrawlProgress) => void;
}

/** Course ids are prefixed by their crawler; `official-training` is the exception. */
const COURSE_ID_PREFIX: Record<string, string> = {
  'official-training': 'official',
  'vn-training-centers': 'vncenter',
};

interface RoleBucket {
  source: string;
  market: string;
  month: string;
  scanned: number;
  byRole: Map<RoleId, { postings: number; withCertification: number }>;
}

/**
 * Counts postings by role as the job crawlers walk their listings. Buckets are
 * (source, market, month); a re-crawl of the same month replaces that bucket
 * rather than adding to it, because the count is "what the board showed in
 * this month", not a running total of sightings.
 *
 * `scanned` is the denominator: without it a bucket says "31 QA postings" with
 * no way to know whether that is a third of the board or a thirtieth.
 */
function createRoleCollector(crawledAt: string) {
  const buckets = new Map<string, RoleBucket>();
  const crawledMonth = crawledAt.slice(0, 7);

  const observe = (observation: RoleObservation): void => {
    const month = /^\d{4}-\d{2}/.test(observation.postedAt ?? '')
      ? (observation.postedAt as string).slice(0, 7)
      : crawledMonth;
    const key = `${observation.source}|${observation.market}|${month}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        source: observation.source,
        market: observation.market,
        month,
        scanned: 0,
        byRole: new Map(ROLE_IDS.map((id) => [id, { postings: 0, withCertification: 0 }])),
      };
      buckets.set(key, bucket);
    }

    bucket.scanned += 1;
    for (const roleId of detectRoles(observation.title)) {
      const counts = bucket.byRole.get(roleId);
      if (!counts) continue;
      counts.postings += 1;
      if (observation.matchedCertification) counts.withCertification += 1;
    }
  };

  // Every role is emitted for every bucket, including the zeroes: "0 of 240
  // postings on this board named a BA role" is a finding, and a missing row
  // would be indistinguishable from a source that was never crawled.
  const records = (sourceUrls: Map<string, string>): RoleDemand[] => {
    const out: RoleDemand[] = [];
    for (const bucket of buckets.values()) {
      for (const roleId of ROLE_IDS) {
        const counts = bucket.byRole.get(roleId)!;
        out.push({
          id: `${bucket.source}_${roleId}_${bucket.market}_${bucket.month}`,
          roleId,
          source: { name: bucket.source, url: sourceUrls.get(bucket.source) ?? '' },
          market: bucket.market as RoleDemand['market'],
          month: bucket.month,
          postings: counts.postings,
          withCertification: counts.withCertification,
          scanned: bucket.scanned,
          crawledAt,
        });
      }
    }
    return out;
  };

  return { observe, records, get size() { return buckets.size; } };
}

function buildSources(
  outcomes: SourceOutcome[],
  jobs: Job[],
  community: CommunityPost[],
  courses: Course[],
  holders: HolderReport[],
): DataSource[] {
  const previous = new Map(readRecords<DataSource>(DATA_FILES.sources).map((s) => [s.id, s]));
  const crawlerById = new Map(ALL_CRAWLERS.map((crawler) => [crawler.id, crawler]));

  const recordsFor = (crawlerId: string, name: string): number => {
    const crawler = crawlerById.get(crawlerId);
    if (crawler?.type === 'job-board') return jobs.filter((job) => job.source.name === name).length;
    if (crawler?.type === 'community') return community.filter((post) => post.source.name === name).length;
    if (crawler?.type === 'certification-body') return holders.length;
    return courses.filter((course) => course.id.startsWith(`${COURSE_ID_PREFIX[crawlerId] ?? crawlerId}_`)).length;
  };

  for (const outcome of outcomes) {
    const existing = previous.get(outcome.id);
    previous.set(outcome.id, {
      id: outcome.id,
      name: outcome.name,
      type: outcome.type,
      url: outcome.url,
      records: recordsFor(outcome.id, outcome.name),
      lastCrawledAt:
        outcome.status === 'ok' ? outcome.finishedAt : (existing?.lastCrawledAt ?? outcome.finishedAt),
      lastCrawlStartedAt:
        outcome.status === 'ok' ? outcome.startedAt : existing?.lastCrawlStartedAt,
      lastCrawlDurationMs:
        outcome.status === 'ok' ? outcome.durationMs : existing?.lastCrawlDurationMs,
      notes:
        outcome.status === 'failed'
          ? `Last run failed: ${outcome.error}`
          : outcome.status === 'skipped'
            ? (outcome.error ?? 'Skipped')
            : undefined,
    });
  }

  return [...previous.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export async function runCrawl(options: RunCrawlOptions = {}): Promise<CrawlProgress> {
  const certifications = loadCertifications();
  const aliasIndex = createAliasIndex(certifications);
  const now = new Date();
  const selected = ALL_CRAWLERS.filter(
    (crawler) => !options.only || options.only.includes(crawler.id),
  );

  const progress: CrawlProgress = {
    state: 'running',
    startedAt: now.toISOString(),
    completed: 0,
    total: selected.length,
    outcomes: [],
    messages: [],
  };

  const emit = () => options.onProgress?.({ ...progress, outcomes: [...progress.outcomes], messages: [...progress.messages] });
  const log = (message: string) => {
    progress.messages.push(message);
    if (progress.messages.length > 200) progress.messages.shift();
    console.log(`  ${message}`);
    emit();
  };

  // The certification dictionary is curated reference data, not crawled.
  writeRecords(DATA_FILES.certifications, certifications);
  log(`Certification dictionary: ${certifications.length} entries`);

  const roleCollector = createRoleCollector(now.toISOString());
  const context: CrawlContext = {
    config: CRAWL_CONFIG,
    certifications,
    aliasIndex,
    now,
    log,
    observeRole: roleCollector.observe,
  };

  for (const crawler of selected) {
    progress.currentSource = crawler.name;
    emit();

    // Full instants, not `YYYY-MM-DD`: the dashboard shows the clock time of the run.
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const finish = () => ({
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
    });

    if (!crawler.isEnabled(CRAWL_CONFIG)) {
      const reason = crawler.skipReason?.(CRAWL_CONFIG) ?? 'Disabled in crawler/config.ts';
      progress.outcomes.push({
        id: crawler.id,
        name: crawler.name,
        url: crawler.url,
        type: crawler.type,
        records: 0,
        status: 'skipped',
        error: reason,
        ...finish(),
      });
      progress.completed += 1;
      log(`${crawler.name}: skipped — ${reason}`);
      continue;
    }

    try {
      const records = await (crawler as SourceCrawler<Job | CommunityPost | Course>).run(context);
      const file =
        crawler.type === 'job-board'
          ? DATA_FILES.jobs
          : crawler.type === 'community'
            ? DATA_FILES.community
            : crawler.type === 'certification-body'
              ? DATA_FILES.holders
              : DATA_FILES.courses;
      // Holder counts are a snapshot of what a vendor page says *right now*, not
      // a discrete event like a job posting or forum thread — merging them
      // would let a figure a page no longer supports (a stale or since-fixed
      // mismatch) survive forever under the same id, since an absent match in
      // a later run never overrides a present one. Every other type keeps
      // accumulating: job boards drop expired postings from their own listings
      // and community threads never come back at all, so merging is what keeps
      // that history (see README's "Crawls merge by record id").
      const merged =
        crawler.type === 'certification-body'
          ? (records as Array<{ id: string }>)
          : mergeById(readRecords<{ id: string }>(file), records as Array<{ id: string }>);
      writeRecords(file, merged);

      progress.outcomes.push({
        id: crawler.id,
        name: crawler.name,
        url: crawler.url,
        type: crawler.type,
        records: records.length,
        status: 'ok',
        ...finish(),
      });
      const elapsed = Date.now() - startedAtMs;
      log(
        `${crawler.name}: stored ${records.length} records (${merged.length} total in file) in ${(elapsed / 1000).toFixed(1)}s`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progress.outcomes.push({
        id: crawler.id,
        name: crawler.name,
        url: crawler.url,
        type: crawler.type,
        records: 0,
        status: 'failed',
        error: message,
        ...finish(),
      });
      log(`${crawler.name}: failed — ${message}`);
    }

    progress.completed += 1;
    emit();
  }

  const roleRecords = roleCollector.records(
    new Map(ALL_CRAWLERS.map((crawler) => [crawler.name, crawler.url])),
  );
  if (roleRecords.length > 0) {
    writeRecords(
      DATA_FILES.roles,
      mergeById(readRecords<RoleDemand>(DATA_FILES.roles), roleRecords),
    );
    const totals = ROLE_IDS.map((roleId) => {
      const rows = roleRecords.filter((row) => row.roleId === roleId);
      return `${roleId} ${rows.reduce((sum, row) => sum + row.postings, 0)}`;
    }).join(', ');
    const scanned = [...new Set(roleRecords.map((row) => `${row.source.name}|${row.market}|${row.month}`))]
      .length;
    log(`Role demand: ${totals} across ${scanned} source/market/month buckets`);
  }

  const jobs = readRecords<Job>(DATA_FILES.jobs);
  const community = readRecords<CommunityPost>(DATA_FILES.community);
  const courses = readRecords<Course>(DATA_FILES.courses);
  const holders = readRecords<HolderReport>(DATA_FILES.holders);
  writeRecords(DATA_FILES.sources, buildSources(progress.outcomes, jobs, community, courses, holders));

  progress.currentSource = 'Scoring & ranking';
  emit();
  const { rankings } = aggregate();
  log(`Ranked ${rankings.length} certifications from ${jobs.length} jobs and ${community.length} discussions`);

  const anySucceeded = progress.outcomes.some((outcome) => outcome.status === 'ok');
  progress.state = anySucceeded || rankings.length > 0 ? 'done' : 'failed';
  if (progress.state === 'failed') {
    progress.error = 'Every source failed or was disabled — check crawler/config.ts and network access.';
  }
  progress.currentSource = undefined;
  progress.finishedAt = new Date().toISOString();
  emit();

  return progress;
}
