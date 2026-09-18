import { fetchJson } from '../../util/http';

export const ZENN_ORIGIN = 'https://zenn.dev';

/** The article shape both the topic listing and the search endpoint return. */
export interface ZennArticle {
  id?: number;
  slug?: string;
  path?: string;
  title?: string;
  comments_count?: number;
  liked_count?: number;
  published_at?: string;
}

interface ArticleListResponse {
  articles?: ZennArticle[];
  next_page?: number | null;
}

interface ArticleDetailResponse {
  article?: {
    title?: string;
    body_html?: string;
    topics?: Array<{ name?: string; display_name?: string }>;
  };
}

/**
 * Articles filed under a Zenn topic, newest first. Topic listings are cheap but
 * hashtag-shaped: they only reach what an author chose to tag, which is why the
 * crawler pairs them with a keyword search.
 */
export async function listTopicArticles(topic: string, page: number): Promise<ZennArticle[]> {
  const url =
    `${ZENN_ORIGIN}/api/articles?topicname=${encodeURIComponent(topic)}` +
    `&order=latest&count=48&page=${page}`;
  return (await fetchJson<ArticleListResponse>(url)).articles ?? [];
}

/**
 * Full-text article search. `/search` is disallowed by Zenn's robots.txt but
 * `/api/search` is not — the rule anchors at the start of the path, and the
 * crawler's robots check matches it literally.
 */
export async function searchArticles(
  term: string,
  page: number,
): Promise<{ articles: ZennArticle[]; nextPage: number | null }> {
  const url =
    `${ZENN_ORIGIN}/api/search?q=${encodeURIComponent(term)}&source=articles&page=${page}`;
  const payload = await fetchJson<ArticleListResponse>(url);
  return { articles: payload.articles ?? [], nextPage: payload.next_page ?? null };
}

/** Body and topics of one article — the only endpoint that carries the text. */
export async function fetchArticleDetail(
  slug: string,
): Promise<{ bodyHtml: string; topics: string[] }> {
  const payload = await fetchJson<ArticleDetailResponse>(
    `${ZENN_ORIGIN}/api/articles/${encodeURIComponent(slug)}`,
  );
  const topics = (payload.article?.topics ?? [])
    .flatMap((topic) => [topic.name, topic.display_name])
    .filter((value): value is string => Boolean(value));
  return { bodyHtml: payload.article?.body_html ?? '', topics };
}
