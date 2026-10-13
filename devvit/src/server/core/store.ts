import { redis } from '@devvit/web/server';
import type { CertificationId } from '../../shared/certifications';
import { CERTIFICATIONS } from '../../shared/certifications';

/**
 * Storage layer. Devvit Redis is namespaced per app installation, so every key
 * here is already scoped to the subreddit the app runs in — no prefixing needed.
 *
 * Layout
 *   stats:totals            hash  "<certId>:post" | "<certId>:comment" -> count
 *   stats:daily:<certId>    hash  "YYYY-MM-DD" -> count
 *   seen:post / seen:comment hash "<thingId>" -> "1"   (idempotency)
 *   meta                    hash  scan bookkeeping
 *
 * Devvit Redis has no key scan, so the key set is fixed and derived from the
 * certification catalogue rather than discovered at runtime.
 */

const TOTALS_KEY = 'stats:totals';
const SEEN_POST_KEY = 'seen:post';
const SEEN_COMMENT_KEY = 'seen:comment';
const META_KEY = 'meta';

export type ItemKind = 'post' | 'comment';

const dailyKey = (certificationId: CertificationId): string => `stats:daily:${certificationId}`;

const seenKey = (kind: ItemKind): string => (kind === 'post' ? SEEN_POST_KEY : SEEN_COMMENT_KEY);

/** UTC day bucket, e.g. "2026-09-26". */
export const dayKey = (timestampMs: number): string => new Date(timestampMs).toISOString().slice(0, 10);

/**
 * Claims a Reddit thing for counting. Returns false if it was already counted.
 *
 * Triggers are not guaranteed to fire exactly once and the scheduled scans
 * revisit recent content, so every write path goes through this first. hSetNX
 * is atomic, which makes concurrent trigger deliveries safe.
 */
export async function claimItem(kind: ItemKind, thingId: string): Promise<boolean> {
  const written = await redis.hSetNX(seenKey(kind), thingId, '1');
  return written === 1;
}

export async function recordMentions(
  kind: ItemKind,
  certificationIds: CertificationId[],
  timestampMs: number
): Promise<void> {
  if (certificationIds.length === 0) {
    return;
  }
  const day = dayKey(timestampMs);
  await Promise.all(
    certificationIds.flatMap((certificationId) => [
      redis.hIncrBy(TOTALS_KEY, `${certificationId}:${kind}`, 1),
      redis.hIncrBy(dailyKey(certificationId), day, 1),
    ])
  );
}

export function readTotals(): Promise<Record<string, string>> {
  return redis.hGetAll(TOTALS_KEY);
}

export function readDailyBucket(certificationId: CertificationId): Promise<Record<string, string>> {
  return redis.hGetAll(dailyKey(certificationId));
}

/** Drops day buckets older than `oldestDayToKeep` (a "YYYY-MM-DD" key). */
export async function pruneDailyBuckets(oldestDayToKeep: string): Promise<number> {
  let removed = 0;
  for (const certification of CERTIFICATIONS) {
    const bucket = await redis.hGetAll(dailyKey(certification.id));
    const stale = Object.keys(bucket).filter((day) => day < oldestDayToKeep);
    if (stale.length > 0) {
      removed += await redis.hDel(dailyKey(certification.id), stale);
    }
  }
  return removed;
}

export function readMeta(): Promise<Record<string, string>> {
  return redis.hGetAll(META_KEY);
}

export async function writeMeta(fields: Record<string, string>): Promise<void> {
  await redis.hSet(META_KEY, fields);
}

export async function clearBackfillProgress(): Promise<void> {
  await redis.hDel(META_KEY, ['backfillCursor', 'backfillComplete']);
}
