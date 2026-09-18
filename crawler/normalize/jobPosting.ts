export interface JobPostingData {
  title: string;
  company: string;
  location: string;
  description: string;
  datePosted: string | null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    // Hex entities too: Hacker News writes &#x2F; and &#x27; throughout, and an
    // undecoded one lands verbatim in a stored title.
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') return record.name;
    if (record.address) return textOf(record.address);
    // Address parts are joined: boards often fill only one of them.
    const parts = ['addressLocality', 'addressRegion', 'addressCountry']
      .map((key) => record[key])
      .filter((part): part is string => typeof part === 'string' && part !== 'Not Available');
    if (parts.length > 0) return parts.join(', ');
    if (typeof record.value === 'string') return record.value;
  }
  return '';
}

function flattenGraph(parsed: unknown): unknown[] {
  return asArray(parsed).flatMap((entry) => {
    if (entry && typeof entry === 'object' && '@graph' in (entry as Record<string, unknown>)) {
      return asArray((entry as Record<string, unknown>)['@graph']);
    }
    return [entry];
  });
}

/**
 * Reads schema.org JobPosting data from the raw contents of a page's
 * `application/ld+json` blocks. Far more stable than CSS selectors, which change
 * with every site redesign.
 */
export function parseJobPostingLd(blocks: string[]): JobPostingData | null {
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    for (const entry of flattenGraph(parsed)) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const types = asArray(record['@type']).map(String);
      if (!types.includes('JobPosting')) continue;

      const locations = asArray(record.jobLocation)
        .map((value) => textOf(value))
        .filter(Boolean);
      const remote = record.jobLocationType === 'TELECOMMUTE';

      return {
        title: textOf(record.title) || textOf(record.name),
        company: textOf(record.hiringOrganization),
        location: remote ? `Remote ${locations.join(', ')}`.trim() : locations.join(', '),
        description: stripHtml(String(record.description ?? '')),
        datePosted: typeof record.datePosted === 'string' ? record.datePosted.slice(0, 10) : null,
      };
    }
  }

  return null;
}

/**
 * Pulls the raw contents of every `application/ld+json` block out of a page.
 * Cheap enough to run on a megabyte of markup, and it keeps crawlers that only
 * need structured data from loading a DOM.
 */
export function extractLdJsonBlocks(html: string): string[] {
  const blocks: string[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) blocks.push(match[1]);
  return blocks;
}
