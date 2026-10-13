import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { HISTORY_RETENTION_DAYS } from '../core/aggregate';
import { dayKey, pruneDailyBuckets } from '../core/store';
import { runBackfillBatch, syncRecent } from '../core/scan';

export const scheduledTasks = new Hono();

scheduledTasks.post('/incremental-sync', async (c) => {
  await c.req.json<TaskRequest>();
  try {
    const result = await syncRecent();
    console.log(
      `incremental-sync: ${result.posts} posts, ${result.comments} comments, ${result.mentions} new mentions`
    );
  } catch (error) {
    console.error('incremental-sync failed:', error);
  }
  return c.json<TaskResponse>({}, 200);
});

scheduledTasks.post('/deep-backfill', async (c) => {
  await c.req.json<TaskRequest>();
  try {
    const result = await runBackfillBatch();
    console.log(`deep-backfill: ${result.processed} posts, complete=${result.complete}`);
  } catch (error) {
    console.error('deep-backfill failed:', error);
  }
  return c.json<TaskResponse>({}, 200);
});

scheduledTasks.post('/prune-history', async (c) => {
  await c.req.json<TaskRequest>();
  try {
    const cutoff = dayKey(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const removed = await pruneDailyBuckets(cutoff);
    console.log(`prune-history: removed ${removed} day buckets older than ${cutoff}`);
  } catch (error) {
    console.error('prune-history failed:', error);
  }
  return c.json<TaskResponse>({}, 200);
});
