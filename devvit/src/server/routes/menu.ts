import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createDashboardPost } from '../core/post';
import { restartBackfill } from '../core/scan';

export const menu = new Hono();

menu.post('/create-post', async (c) => {
  try {
    const post = await createDashboardPost();
    return c.json<UiResponse>(
      { navigateTo: `https://www.reddit.com/r/${context.subredditName}/comments/${post.id}` },
      200
    );
  } catch (error) {
    console.error('Failed to create dashboard post:', error);
    return c.json<UiResponse>({ showToast: 'Could not create the cert-chart post' }, 400);
  }
});

menu.post('/rescan', async (c) => {
  try {
    await restartBackfill();
    return c.json<UiResponse>(
      { showToast: 'Rescanning subreddit history — counts update as it runs' },
      200
    );
  } catch (error) {
    console.error('Failed to start rescan:', error);
    return c.json<UiResponse>({ showToast: 'Could not start the rescan' }, 400);
  }
});
