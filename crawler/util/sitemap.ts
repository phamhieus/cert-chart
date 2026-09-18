import { fetchText } from './http';

export interface SitemapEntry {
  url: string;
  /** `lastmod` as the sitemap publishes it, or null when it omits one. */
  lastmod: string | null;
}

interface SitemapDocument {
  /** Child sitemap files, when this document is a `<sitemapindex>`. */
  sitemaps: string[];
  /** Page entries, when this document is a `<urlset>`. */
  entries: SitemapEntry[];
}

const LOC = /<loc>\s*([^<]+?)\s*<\/loc>/g;
const ENTRY = /<url>([\s\S]*?)<\/url>/g;

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Sitemaps are plain enough that a regex beats pulling in an XML parser, and the
 * files are big — vieclam24h ships 4,180 job URLs in a single 930 KB document.
 */
export function parseSitemap(xml: string): SitemapDocument {
  const isIndex = xml.includes('<sitemapindex');

  if (isIndex) {
    const sitemaps: string[] = [];
    for (const match of xml.matchAll(LOC)) sitemaps.push(decode(match[1]));
    return { sitemaps, entries: [] };
  }

  const entries: SitemapEntry[] = [];
  for (const match of xml.matchAll(ENTRY)) {
    const block = match[1];
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block);
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(block);
    entries.push({ url: decode(loc[1]), lastmod: lastmod ? lastmod[1] : null });
  }
  return { sitemaps: [], entries };
}

export interface CollectOptions {
  /** Cap on child sitemap files to open, so one run stays bounded. */
  maxFiles: number;
  /** Cap on entries returned once `keep` has filtered them. */
  maxEntries: number;
  /** Keeps only the URLs worth fetching — the whole point is to fetch few. */
  keep?: (url: string) => boolean;
  /** Skips a child sitemap file entirely, before it is downloaded. */
  keepFile?: (url: string) => boolean;
  onProgress?: (message: string) => void;
}

/**
 * Walks a sitemap (index or not) and returns the entries that survive `keep`.
 * Filtering on the URL before fetching anything is what makes a board with
 * thousands of postings crawlable inside a rate limit: the slug already says
 * which occupation a posting belongs to.
 */
export async function collectSitemapEntries(
  rootUrl: string,
  options: CollectOptions,
): Promise<SitemapEntry[]> {
  const root = parseSitemap(await fetchText(rootUrl, { accept: 'application/xml,text/xml' }));
  const collected: SitemapEntry[] = [];

  const take = (entries: SitemapEntry[]): void => {
    for (const entry of entries) {
      if (options.keep && !options.keep(entry.url)) continue;
      if (collected.length >= options.maxEntries) return;
      collected.push(entry);
    }
  };

  take(root.entries);

  const queue = root.sitemaps.filter((url) => !options.keepFile || options.keepFile(url));
  let opened = 0;

  for (const child of queue) {
    if (opened >= options.maxFiles || collected.length >= options.maxEntries) break;
    opened += 1;
    try {
      const document = parseSitemap(
        await fetchText(child, { accept: 'application/xml,text/xml', timeoutMs: 60_000 }),
      );
      // One more level of nesting is common: index → per-type index → urlset.
      if (document.sitemaps.length > 0) {
        for (const grandchild of document.sitemaps) {
          if (opened >= options.maxFiles || collected.length >= options.maxEntries) break;
          if (options.keepFile && !options.keepFile(grandchild)) continue;
          opened += 1;
          const nested = parseSitemap(
            await fetchText(grandchild, { accept: 'application/xml,text/xml', timeoutMs: 60_000 }),
          );
          take(nested.entries);
          options.onProgress?.(`${grandchild}: ${nested.entries.length} urls`);
        }
      } else {
        take(document.entries);
        options.onProgress?.(`${child}: ${document.entries.length} urls`);
      }
    } catch (error) {
      options.onProgress?.(`${child}: unreadable (${(error as Error).message})`);
    }
  }

  return collected;
}
