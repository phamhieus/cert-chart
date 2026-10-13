import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { ErrorResponse, StatsResponse } from '../../shared/api';
import { buildStats } from '../core/aggregate';

export const api = new Hono();

api.get('/stats', async (c) => {
  try {
    const stats = await buildStats(context.subredditName ?? 'unknown');
    return c.json<StatsResponse>(stats, 200);
  } catch (error) {
    console.error('Failed to build stats:', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not load certification stats' }, 500);
  }
});
