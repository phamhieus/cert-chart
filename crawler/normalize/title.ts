const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/**
 * Decodes HTML entities in one pass, so `&amp;quot;` becomes the literal text
 * `&quot;` it was written as rather than a quote mark. Unknown names are left
 * untouched instead of guessed at.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/**
 * A title exactly as its author wrote it, minus transport damage: entities an
 * API left encoded (Stack Exchange and Viblo both do), stray tags, and runs of
 * whitespace from line-wrapped descriptions. Full-width spaces in Japanese
 * titles are kept — they are the author's punctuation, not padding.
 */
export function cleanTitle(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\r\n\f\v ]+/g, ' ')
    .trim();
}

/** The opening of a longer text, cut at a word boundary. Undefined when empty. */
export function toExcerpt(value: string, maxLength = 220): string | undefined {
  const text = cleanTitle(value);
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
