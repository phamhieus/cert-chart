import { fetchJson } from '../../util/http';

export const DNH_ORIGIN = 'https://daynhauhoc.com';

export interface DiscourseTopic {
  id?: number;
  slug?: string;
  title?: string;
  posts_count?: number;
  reply_count?: number;
  views?: number;
  like_count?: number;
  created_at?: string;
  posters?: unknown[];
}

interface LatestResponse {
  topic_list?: { topics?: DiscourseTopic[] };
}

interface TopicResponse {
  tags?: string[];
  post_stream?: { posts?: Array<{ cooked?: string }> };
}

/**
 * `order=created` walks the forum backwards in time; the default ordering is by
 * last activity, which never reaches older threads at all.
 */
export async function listLatestTopics(page: number): Promise<DiscourseTopic[]> {
  const response = await fetchJson<LatestResponse>(
    `${DNH_ORIGIN}/latest.json?order=created&page=${page}`,
  );
  return response.topic_list?.topics ?? [];
}

/**
 * The posts of one thread. `/search` is disallowed here, but `/t/<id>.json` is
 * not, and it is the only way to read what a thread actually says rather than
 * what its title advertises.
 */
export async function fetchTopicBody(id: number): Promise<string> {
  const response = await fetchJson<TopicResponse>(`${DNH_ORIGIN}/t/${id}.json`);
  const posts = (response.post_stream?.posts ?? []).map((post) => post.cooked ?? '');
  return `${(response.tags ?? []).join(' ')}\n${posts.join('\n')}`;
}
