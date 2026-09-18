import type { Certification, JobCertificationRef, RequirementType } from '../../src/types';
import {
  buildAliasIndex,
  detectRequirement,
  findCertificationsInText,
  type AliasIndex,
} from '../../src/utils/certAliases';
import { CERTIFICATIONS } from '../dictionary/certifications';

export function loadCertifications(): Certification[] {
  return CERTIFICATIONS;
}

export function createAliasIndex(certifications = CERTIFICATIONS): AliasIndex {
  return buildAliasIndex(certifications);
}

const STRENGTH: Record<RequirementType, number> = { required: 3, preferred: 2, mentioned: 1 };

function segments(text: string): string[] {
  return text
    .split(/(?:\r?\n)+|(?<=[.!?;•])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Extracts certification references from a job description, classifying each one
 * by the wording of the line it appears on (required / preferred / mentioned).
 */
export function extractJobCertifications(text: string, index: AliasIndex): JobCertificationRef[] {
  const strongest = new Map<string, RequirementType>();

  for (const segment of segments(text)) {
    const hits = findCertificationsInText(segment, index);
    if (hits.length === 0) continue;
    const requirement = detectRequirement(segment);
    for (const hit of hits) {
      const current = strongest.get(hit.certificationId);
      if (!current || STRENGTH[requirement] > STRENGTH[current]) {
        strongest.set(hit.certificationId, requirement);
      }
    }
  }

  return [...strongest].map(([id, requirement]) => ({ id, requirement }));
}

export function countCertificationMentions(text: string, index: AliasIndex): Map<string, number> {
  const counts = new Map<string, number>();
  for (const hit of findCertificationsInText(text, index)) {
    counts.set(hit.certificationId, (counts.get(hit.certificationId) ?? 0) + hit.count);
  }
  return counts;
}
