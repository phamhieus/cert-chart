import type { CertificationId } from '../../shared/certifications';
import { CERTIFICATIONS } from '../../shared/certifications';

/**
 * Lowercases and flattens text so alias matching only has to deal with
 * `[a-z0-9+-]` and single spaces. Unicode dashes (– —) become spaces, ASCII
 * hyphens survive because exam codes use them (`saa-c03`, `az-900`).
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‐-―−]/g, ' ')
    .replace(/[^a-z0-9+\- ]+/g, ' ')
    // A hyphen only carries meaning inside a code such as "saa-c03"; a loose
    // one ("Solutions Architect - Associate") is just punctuation.
    .replace(/(?<![a-z0-9])-|-(?![a-z0-9])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `az-900` should also be found as `az 900` and `az900`. */
function aliasVariants(alias: string): string[] {
  const normalized = normalizeText(alias);
  return [...new Set([normalized, normalized.replace(/-/g, ' '), normalized.replace(/-/g, '')])].filter(
    (variant) => variant.length > 0
  );
}

/**
 * After normalisation an alias only contains `[a-z0-9+ -]`, so `+` is the one
 * regex metacharacter left to neutralise. A character class does it without
 * escape sequences.
 */
function escapeAlias(alias: string): string {
  return alias.replace(/\+/g, '[+]');
}

/**
 * `-` counts as a boundary so "AWS-SAA" matches the `saa` alias, while
 * `+` does not, so "security+" never matches a bare "security".
 */
function buildMatcher(aliases: string[]): RegExp {
  const pattern = [...new Set(aliases.flatMap(aliasVariants))]
    .sort((a, b) => b.length - a.length)
    .map(escapeAlias)
    .join('|');
  return new RegExp(`(?<![a-z0-9+])(?:${pattern})(?![a-z0-9+])`);
}

const MATCHERS: { id: CertificationId; matcher: RegExp }[] = CERTIFICATIONS.map((certification) => ({
  id: certification.id,
  matcher: buildMatcher(certification.aliases),
}));

/**
 * Returns the certifications mentioned in a piece of text, at most once each.
 * One post or comment therefore contributes one mention per certification,
 * which keeps `total = posts + comments` true.
 */
export function detectCertifications(text: string): CertificationId[] {
  const haystack = normalizeText(text);
  if (haystack.length === 0) {
    return [];
  }
  return MATCHERS.filter(({ matcher }) => matcher.test(haystack)).map(({ id }) => id);
}
