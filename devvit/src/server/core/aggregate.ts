import type { CertStatRow, StatsResponse } from '../../shared/api';
import { CERTIFICATIONS } from '../../shared/certifications';
import { dayKey, readDailyBucket, readMeta, readTotals } from './store';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many days of history the daily buckets keep before `prune-history` trims them. */
export const HISTORY_RETENTION_DAYS = 400;

function toCount(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Sums `spanDays` day-buckets, starting `offsetDays` back from `endMs`. */
function sumWindow(
  bucket: Record<string, string>,
  endMs: number,
  offsetDays: number,
  spanDays: number
): number {
  let sum = 0;
  for (let index = 0; index < spanDays; index += 1) {
    sum += toCount(bucket[dayKey(endMs - (offsetDays + index) * DAY_MS)]);
  }
  return sum;
}

function trendPercent(last7: number, previous7: number): number | null {
  if (previous7 === 0) {
    return null;
  }
  return Math.round(((last7 - previous7) / previous7) * 1000) / 10;
}

export async function buildStats(subreddit: string): Promise<StatsResponse> {
  const now = Date.now();
  const [totals, meta, buckets] = await Promise.all([
    readTotals(),
    readMeta(),
    Promise.all(CERTIFICATIONS.map((certification) => readDailyBucket(certification.id))),
  ]);

  const rows: CertStatRow[] = CERTIFICATIONS.map((certification, index) => {
    const bucket = buckets[index] ?? {};
    const posts = toCount(totals[`${certification.id}:post`]);
    const comments = toCount(totals[`${certification.id}:comment`]);
    const last7 = sumWindow(bucket, now, 0, 7);
    const previous7 = sumWindow(bucket, now, 7, 7);

    return {
      id: certification.id,
      name: certification.name,
      shortName: certification.shortName,
      vendor: certification.vendor,
      total: posts + comments,
      posts,
      comments,
      last7,
      last30: sumWindow(bucket, now, 0, 30),
      trendPct: trendPercent(last7, previous7),
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const cursor = Number(meta['backfillCursor']);

  return {
    type: 'stats',
    subreddit,
    generatedAt: new Date(now).toISOString(),
    totalMentions: rows.reduce((sum, row) => sum + row.total, 0),
    rows,
    scan: {
      backfillComplete: meta['backfillComplete'] === '1',
      oldestScannedAt: Number.isFinite(cursor) && cursor > 0 ? new Date(cursor).toISOString() : null,
      lastSyncAt: meta['lastSyncAt'] ?? null,
    },
  };
}
