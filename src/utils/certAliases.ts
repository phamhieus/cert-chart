import type { Certification, RequirementType } from '../types';

/** Lowercase, strip diacritics, collapse separators to single spaces. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―]/g, '-')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Separator-insensitive key so `AZ-104`, `AZ 104` and `az104` collapse to one token. */
export function compactKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9+#]/g, '');
}

export function aliasesOf(cert: Certification): string[] {
  const values = [cert.name, cert.shortName, cert.code, ...cert.aliases].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return Array.from(new Set(values));
}

export interface AliasIndex {
  byKey: Map<string, string>;
  patterns: Array<{ certificationId: string; alias: string; regex: RegExp }>;
}

function aliasToRegex(alias: string): RegExp {
  const normalized = normalizeText(alias);
  const escaped = normalized
    .split(' ')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\-_/]*');
  // Alphanumeric boundaries only: `\b` would not fire next to `+` in `security+`.
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'g');
}

export function buildAliasIndex(certifications: Certification[]): AliasIndex {
  const byKey = new Map<string, string>();
  const patterns: AliasIndex['patterns'] = [];

  for (const cert of certifications) {
    for (const alias of aliasesOf(cert)) {
      const key = compactKey(alias);
      if (key.length >= 3 && !byKey.has(key)) byKey.set(key, cert.id);
      patterns.push({ certificationId: cert.id, alias, regex: aliasToRegex(alias) });
    }
  }

  // Longest alias first so `aws certified solutions architect` wins over `aws`.
  patterns.sort((a, b) => b.alias.length - a.alias.length);
  return { byKey, patterns };
}

export function resolveCertificationId(value: string, index: AliasIndex): string | null {
  return index.byKey.get(compactKey(value)) ?? null;
}

export interface AliasHit {
  certificationId: string;
  alias: string;
  count: number;
}

/**
 * Counts alias occurrences per certification in free text. Longer aliases are
 * matched first and their span is masked, so "AWS Solutions Architect Associate"
 * is not also counted as "AWS Solutions Architect".
 */
export function findCertificationsInText(text: string, index: AliasIndex): AliasHit[] {
  const haystack = normalizeText(text);
  const consumed = new Uint8Array(haystack.length);
  const hits = new Map<string, AliasHit>();

  for (const { certificationId, alias, regex } of index.patterns) {
    regex.lastIndex = 0;
    let count = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(haystack)) !== null) {
      const start = match.index + (match[1]?.length ?? 0);
      const end = regex.lastIndex - (match[2]?.length ?? 0);
      let free = true;
      for (let i = start; i < end; i += 1) {
        if (consumed[i]) {
          free = false;
          break;
        }
      }
      if (free) {
        consumed.fill(1, start, end);
        count += 1;
      }
      regex.lastIndex = Math.max(end, match.index + 1);
    }

    if (count === 0) continue;

    const existing = hits.get(certificationId);
    if (existing) {
      existing.count += count;
    } else {
      hits.set(certificationId, { certificationId, alias, count });
    }
  }

  return [...hits.values()];
}

const REQUIREMENT_CUES: Array<{ requirement: RequirementType; cues: string[] }> = [
  {
    requirement: 'required',
    cues: [
      'required',
      'requirement',
      'must have',
      'must hold',
      'mandatory',
      'yeu cau',
      'bat buoc',
      'can co',
    ],
  },
  {
    requirement: 'preferred',
    cues: [
      'preferred',
      'preferably',
      'nice to have',
      'plus',
      'advantage',
      'bonus',
      'uu tien',
      'la mot loi the',
      'loi the',
      'khuyen khich',
    ],
  },
];

/**
 * Classifies how a job posting treats a certification, based on the wording
 * around the mention. Defaults to `mentioned` when no cue is present.
 */
export function detectRequirement(context: string): RequirementType {
  const normalized = normalizeText(context);
  for (const { requirement, cues } of REQUIREMENT_CUES) {
    if (cues.some((cue) => normalized.includes(cue))) return requirement;
  }
  return 'mentioned';
}

/** Matches a dashboard search box query against a certification. */
export function matchesQuery(cert: Certification, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const compact = compactKey(query);
  const haystack = [...aliasesOf(cert), cert.vendor, cert.category];
  return haystack.some((value) => {
    const normalized = normalizeText(value);
    return normalized.includes(q) || compactKey(value).includes(compact);
  });
}
