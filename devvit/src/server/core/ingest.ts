import { detectCertifications } from './parser';
import type { ItemKind } from './store';
import { claimItem, recordMentions } from './store';

export type IngestItem = {
  /** Reddit thing id, e.g. "t3_abc123" or "t1_def456". */
  id: string;
  text: string;
  /** Epoch value from either the Reddit API (ms) or a trigger payload. */
  createdAt: number;
};

/**
 * Trigger payloads carry epoch values and the Reddit API carries `Date`s.
 * Anything that looks like seconds is promoted, anything missing falls back to
 * now, so a bad timestamp can never land a mention in 1970.
 */
function toMilliseconds(createdAt: number): number {
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return Date.now();
  }
  return createdAt < 1e12 ? createdAt * 1000 : createdAt;
}

/**
 * Counts one post or comment. Returns how many certifications it contributed.
 *
 * Only items that actually mention something are claimed, so re-scanning text
 * that matched nothing stays free and a later catalogue addition can still pick
 * it up.
 */
export async function ingestItem(kind: ItemKind, item: IngestItem): Promise<number> {
  const certificationIds = detectCertifications(item.text);
  if (certificationIds.length === 0) {
    return 0;
  }
  const claimed = await claimItem(kind, item.id);
  if (!claimed) {
    return 0;
  }
  await recordMentions(kind, certificationIds, toMilliseconds(item.createdAt));
  return certificationIds.length;
}
