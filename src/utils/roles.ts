import { ROLE_PATTERNS } from '../constants/roles';
import type { Job, JobRole } from '../types';
import { normalizeText } from './certAliases';

// Job records are immutable once loaded, so each title is classified once.
const cache = new WeakMap<Job, JobRole>();

/** The role a posting hires for, read from its title alone. */
export function classifyRole(title: string): JobRole {
  const normalized = normalizeText(title);
  return ROLE_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.role ?? 'other';
}

export function jobRole(job: Job): JobRole {
  let role = cache.get(job);
  if (role === undefined) {
    role = classifyRole(job.title);
    cache.set(job, role);
  }
  return role;
}
