import { Hono } from 'hono';
import type {
  OnCommentCreateRequest,
  OnPostCreateRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { ingestItem } from '../core/ingest';
import { createDashboardPost } from '../core/post';
import { scheduleBackfill } from '../core/scan';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createDashboardPost();
    await scheduleBackfill(10);
    return c.json<TriggerResponse>(
      { status: 'success', message: `Created dashboard post ${post.id} and queued the backfill` },
      200
    );
  } catch (error) {
    console.error('App install setup failed:', error);
    return c.json<TriggerResponse>({ status: 'error', message: 'Install setup failed' }, 400);
  }
});

triggers.post('/on-post-create', async (c) => {
  const { post } = await c.req.json<OnPostCreateRequest>();
  if (post && !post.deleted && !post.spam) {
    await ingestItem('post', {
      id: post.id,
      text: `${post.title}\n${post.selftext}`,
      createdAt: post.createdAt,
    });
  }
  return c.json<TriggerResponse>({ status: 'success', message: 'ok' }, 200);
});

triggers.post('/on-comment-create', async (c) => {
  const { comment } = await c.req.json<OnCommentCreateRequest>();
  if (comment && !comment.deleted && !comment.spam) {
    await ingestItem('comment', {
      id: comment.id,
      text: comment.body,
      createdAt: comment.createdAt,
    });
  }
  return c.json<TriggerResponse>({ status: 'success', message: 'ok' }, 200);
});
