import { context, reddit, scheduler } from '@devvit/web/server';
import type { Comment, Post } from '@devvit/web/server';
import { ingestItem } from './ingest';
import { clearBackfillProgress, readMeta, writeMeta } from './store';

/** Posts the hourly catch-up pass re-checks. Triggers do the real-time work. */
const RECENT_POST_LIMIT = 50;
/** Comments fetched per post. Reddit listings are capped, this keeps runs bounded. */
const COMMENTS_PER_POST_LIMIT = 100;
/**
 * How deep the historical backfill can reach. Reddit's subreddit listings stop
 * at roughly 1000 items, so nothing older than that is reachable at all.
 */
const BACKFILL_LISTING_LIMIT = 500;
const BACKFILL_POSTS_PER_RUN = 25;
const BACKFILL_BUDGET_MS = 20_000;
const BACKFILL_JOB_NAME = 'deep-backfill';

export type ScanResult = {
  posts: number;
  comments: number;
  mentions: number;
};

function requireSubredditName(): string {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is missing from the Devvit context');
  }
  return subredditName;
}

const postText = (post: Post): string => `${post.title}\n${post.body ?? ''}`;

async function ingestPostWithComments(post: Post): Promise<ScanResult> {
  let mentions = await ingestItem('post', {
    id: post.id,
    text: postText(post),
    createdAt: post.createdAt.getTime(),
  });

  const comments: Comment[] = await reddit
    .getComments({ postId: post.id, limit: COMMENTS_PER_POST_LIMIT })
    .all();

  for (const comment of comments) {
    mentions += await ingestItem('comment', {
      id: comment.id,
      text: comment.body,
      createdAt: comment.createdAt.getTime(),
    });
  }

  return { posts: 1, comments: comments.length, mentions };
}

/**
 * Hourly catch-up over the newest posts. Triggers already count new content in
 * real time; this exists because trigger delivery is best-effort, and because
 * comments on recent posts may arrive while the app is being upgraded.
 */
export async function syncRecent(): Promise<ScanResult> {
  const subredditName = requireSubredditName();
  const posts = await reddit.getNewPosts({ subredditName, limit: RECENT_POST_LIMIT }).all();

  const result: ScanResult = { posts: 0, comments: 0, mentions: 0 };
  for (const post of posts) {
    const postResult = await ingestPostWithComments(post);
    result.posts += postResult.posts;
    result.comments += postResult.comments;
    result.mentions += postResult.mentions;
  }

  await writeMeta({ lastSyncAt: new Date().toISOString() });
  return result;
}

export async function scheduleBackfill(delaySeconds: number): Promise<void> {
  await scheduler.runJob({
    name: BACKFILL_JOB_NAME,
    data: {},
    runAt: new Date(Date.now() + delaySeconds * 1000),
  });
}

export async function restartBackfill(): Promise<void> {
  await clearBackfillProgress();
  await scheduleBackfill(5);
}

/**
 * One batch of the historical backfill.
 *
 * Progress is a timestamp cursor rather than a listing cursor: each run pulls
 * the newest posts, skips everything newer than the oldest post already
 * scanned, and works through the next batch. That is drift-free when new posts
 * arrive mid-backfill, and it terminates when the listing is exhausted. The
 * job re-schedules itself until it is done.
 */
export async function runBackfillBatch(): Promise<{ processed: number; complete: boolean }> {
  const subredditName = requireSubredditName();
  const meta = await readMeta();
  const cursorValue = Number(meta['backfillCursor']);
  const cursor = Number.isFinite(cursorValue) && cursorValue > 0 ? cursorValue : undefined;

  const listing = await reddit
    .getNewPosts({ subredditName, limit: BACKFILL_LISTING_LIMIT })
    .all();
  const pending =
    cursor === undefined ? listing : listing.filter((post) => post.createdAt.getTime() < cursor);

  if (pending.length === 0) {
    await writeMeta({ backfillComplete: '1', backfillFinishedAt: new Date().toISOString() });
    return { processed: 0, complete: true };
  }

  const startedAt = Date.now();
  let processed = 0;
  let oldestScanned = cursor;

  for (const post of pending) {
    if (processed >= BACKFILL_POSTS_PER_RUN || Date.now() - startedAt > BACKFILL_BUDGET_MS) {
      break;
    }
    await ingestPostWithComments(post);
    oldestScanned = post.createdAt.getTime();
    processed += 1;
  }

  const complete = processed >= pending.length;
  await writeMeta({
    backfillCursor: String(oldestScanned ?? Date.now()),
    backfillComplete: complete ? '1' : '0',
    ...(complete ? { backfillFinishedAt: new Date().toISOString() } : {}),
  });

  if (!complete) {
    await scheduleBackfill(30);
  }

  return { processed, complete };
}
