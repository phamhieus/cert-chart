import type {
  Certification,
  CommunityPost,
  Course,
  DataSource,
  HolderReport,
  Job,
  Ranking,
} from '../types';
import { parseTimestamp } from '../utils/format';

const DATA_FILES = {
  certifications: 'certifications.json',
  rankings: 'rankings.json',
  jobs: 'jobs.json',
  community: 'community.json',
  courses: 'courses.json',
  holders: 'holders.json',
  sources: 'sources.json',
} as const;

export interface Dataset {
  certifications: Certification[];
  certificationsById: Map<string, Certification>;
  rankings: Ranking[];
  rankingsByCertification: Map<string, Ranking>;
  jobs: Job[];
  community: CommunityPost[];
  courses: Course[];
  holders: HolderReport[];
  /** Published figures for one certification — the only ones the ranking scores. */
  holdersByCertification: Map<string, HolderReport>;
  /** Vendor-wide figures, keyed by vendor: shown as context, never scored. */
  holdersByVendor: Map<string, HolderReport>;
  sources: DataSource[];
  /** The dataset's own "today" — its most recent crawl date. */
  datasetNow: Date;
}

function dataUrl(file: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}data/${file}`;
}

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(dataUrl(file), { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Failed to load ${file} (${response.status} ${response.statusText})`);
  }
  return (await response.json()) as T;
}

function resolveDatasetNow(sources: DataSource[], jobs: Job[]): Date {
  const latest = [...sources.map((s) => s.lastCrawledAt), ...jobs.map((j) => j.crawledAt)]
    .filter(Boolean)
    .sort()
    .at(-1);
  return parseTimestamp(latest) ?? new Date();
}

let cached: Promise<Dataset> | null = null;

async function load(): Promise<Dataset> {
  const [certifications, rankings, jobs, community, courses, sources, holders] = await Promise.all([
    fetchJson<Certification[]>(DATA_FILES.certifications),
    fetchJson<Ranking[]>(DATA_FILES.rankings),
    fetchJson<Job[]>(DATA_FILES.jobs),
    fetchJson<CommunityPost[]>(DATA_FILES.community),
    fetchJson<Course[]>(DATA_FILES.courses),
    fetchJson<DataSource[]>(DATA_FILES.sources),
    // A dataset crawled before holder figures existed simply has no file.
    fetchJson<HolderReport[]>(DATA_FILES.holders).catch(() => [] as HolderReport[]),
  ]);

  return {
    certifications,
    certificationsById: new Map(certifications.map((cert) => [cert.id, cert])),
    rankings,
    rankingsByCertification: new Map(rankings.map((ranking) => [ranking.certificationId, ranking])),
    jobs,
    community,
    courses,
    holders,
    holdersByCertification: new Map(
      holders
        .filter((report) => report.scope === 'certification' && report.certificationId)
        .map((report) => [report.certificationId as string, report]),
    ),
    holdersByVendor: new Map(
      holders.filter((report) => report.scope === 'vendor').map((report) => [report.vendor, report]),
    ),
    sources,
    datasetNow: resolveDatasetNow(sources, jobs),
  };
}

/** Drops the cache so the next load picks up freshly crawled files. */
export function invalidateDataset(): void {
  cached = null;
}

/** Loads every dataset once per session; later callers share the same promise. */
export function loadDataset(): Promise<Dataset> {
  cached ??= load().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}
