import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Certification,
  CommunityPost,
  Course,
  DataSource,
  DatasetSummary,
  Job,
  Ranking,
} from '../src/types';

export type { DatasetSummary };

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(HERE, '../public/data');

export const DATA_FILES = {
  certifications: 'certifications.json',
  rankings: 'rankings.json',
  jobs: 'jobs.json',
  community: 'community.json',
  courses: 'courses.json',
  holders: 'holders.json',
  sources: 'sources.json',
} as const;

export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

export function readRecords<T>(file: string): T[] {
  const path = resolve(DATA_DIR, file);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeRecords(file: string, records: unknown[]): void {
  ensureDataDir();
  writeFileSync(resolve(DATA_DIR, file), `${JSON.stringify(records, null, 2)}\n`, 'utf8');
}

/** Later runs refresh records with the same id and keep everything crawled before. */
export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const merged = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) merged.set(record.id, record);
  return [...merged.values()];
}

export function datasetSummary(): DatasetSummary {
  const certifications = readRecords<Certification>(DATA_FILES.certifications);
  const jobs = readRecords<Job>(DATA_FILES.jobs);
  const community = readRecords<CommunityPost>(DATA_FILES.community);
  const courses = readRecords<Course>(DATA_FILES.courses);
  const rankings = readRecords<Ranking>(DATA_FILES.rankings);
  const sources = readRecords<DataSource>(DATA_FILES.sources);

  const lastCrawledAt =
    sources
      .map((source) => source.lastCrawledAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    certifications: certifications.length,
    jobs: jobs.length,
    community: community.length,
    courses: courses.length,
    rankings: rankings.length,
    lastCrawledAt,
    // Evidence is what makes the dashboard meaningful; the dictionary alone is not.
    isEmpty: jobs.length === 0 && community.length === 0,
  };
}
