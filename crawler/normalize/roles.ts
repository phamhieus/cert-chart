import type { RoleId } from '../../src/types';
import { normalizeText } from '../../src/utils/certAliases';

interface RoleDefinition {
  id: RoleId;
  label: string;
  /** Matched against the posting title only — see `detectRoles`. */
  terms: string[];
}

/**
 * Role vocabulary for the role-demand signal. This is deliberately separate
 * from the certification dictionary: a role is what a posting is hiring for, a
 * certification is what a posting asks the candidate to hold, and conflating
 * the two would let every "Manual Tester" advert count as ISTQB demand.
 *
 * Terms are matched against the **title only**. A description routinely says
 * "work closely with the QA team" or "hand over to DevOps" in a posting that is
 * hiring neither, so the body is evidence of collaboration, not of the role
 * being hired.
 */
const ROLES: RoleDefinition[] = [
  {
    id: 'qa',
    label: 'QA / QC / Tester',
    // "QA", "QC" and "tester" are the three names Vietnamese postings use for
    // one role, which is why they are one entry rather than three.
    terms: [
      'qa',
      'qc',
      'tester',
      'testing',
      'test engineer',
      'quality assurance',
      'quality control',
      'quality engineer',
      'sdet',
      'kiem thu',
      'kiem dinh chat luong',
    ],
  },
  {
    id: 'ba',
    label: 'Business Analyst',
    // No bare "BA": `normalizeText` lowercases, and "ba" is an ordinary
    // Vietnamese word (three, father), so it would match a large share of
    // Vietnamese titles that have nothing to do with the role.
    terms: [
      'business analyst',
      'business analysis',
      'businessanalyst',
      'phan tich nghiep vu',
      'chuyen vien phan tich nghiep vu',
      'chuyen gia phan tich nghiep vu',
    ],
  },
  {
    id: 'devops',
    label: 'DevOps / SRE',
    terms: [
      'devops',
      'dev ops',
      'sre',
      'site reliability',
      'platform engineer',
      'infrastructure engineer',
      'ky su he thong',
    ],
  },
];

export const ROLE_IDS: RoleId[] = ROLES.map((role) => role.id);

export const ROLE_LABELS: Record<RoleId, string> = Object.fromEntries(
  ROLES.map((role) => [role.id, role.label]),
) as Record<RoleId, string>;

/** Alphanumeric boundaries, same rule the certification aliases use. */
function termToRegex(term: string): RegExp {
  const escaped = normalizeText(term)
    .split(' ')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\-_/]*');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
}

const COMPILED: Array<{ id: RoleId; patterns: RegExp[] }> = ROLES.map((role) => ({
  id: role.id,
  patterns: role.terms.map(termToRegex),
}));

/**
 * Which roles a posting title is hiring for. A title can name more than one
 * ("QA / DevOps Engineer"), so this returns a set rather than a single role.
 */
export function detectRoles(title: string): RoleId[] {
  const haystack = normalizeText(title);
  if (!haystack) return [];
  return COMPILED.filter((role) => role.patterns.some((pattern) => pattern.test(haystack))).map(
    (role) => role.id,
  );
}
