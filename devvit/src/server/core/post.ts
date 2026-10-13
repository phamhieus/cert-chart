import { context, reddit } from '@devvit/web/server';

export async function createDashboardPost() {
  const subredditName = context.subredditName ?? 'this subreddit';
  return reddit.submitCustomPost({
    title: `Certification mentions in r/${subredditName}`,
  });
}
