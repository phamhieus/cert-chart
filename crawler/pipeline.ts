import type { CommunityPost, Course, DataSource, HolderReport, Job } from '../src/types';
import { aggregate } from './aggregate/index';
import { dayNhauHocCrawler } from './communities/daynhauhoc';
import { devToCrawler } from './communities/devto';
import { gitHubCrawler } from './communities/github';
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
import { DATA_FILES, mergeById, readRecords, writeRecords } from './store';
import type { CrawlContext, CrawlProgress, SourceCrawler, SourceOutcome } from './types';

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
  redditCrawler,
  vozCrawler,
  quanTriMangCrawler,
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

  const context: CrawlContext = { config: CRAWL_CONFIG, certifications, aliasIndex, now, log };

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
      const merged = mergeById(readRecords<{ id: string }>(file), records as Array<{ id: string }>);
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
