import type { JobRole } from '../types';

export const ROLE_LABELS: Record<JobRole, string> = {
  ba: 'Business Analyst',
  pm: 'Project / Product',
  qa: 'QA / Testing',
  security: 'Security',
  data: 'Data / AI',
  devops: 'DevOps / Cloud / Infra',
  developer: 'Developer',
  other: 'Other roles',
};

/**
 * Title patterns per role, matched against `normalizeText(title)` — lowercase,
 * diacritics stripped — so Vietnamese titles are written without accents here.
 *
 * Order is the tie-break: the first role whose pattern matches wins. Narrow
 * roles come before broad ones, so "Cloud Security Engineer" is security, not
 * DevOps, "QA Automation Engineer" is QA, not developer, and "Business Data
 * Analyst" is data while plain "Business Analyst" is BA. A title nothing
 * matches is "other" — guessing would put sales engineers among developers.
 */
export const ROLE_PATTERNS: Array<{ role: JobRole; pattern: RegExp }> = [
  {
    role: 'pm',
    pattern:
      /\b(project|program|programme|product|delivery|engagement) (manager|management|owner|lead|leader|director)|\bprojekt ?(manager|leiter)|\bhead of (projects?|delivery|product)|\bscrum ?master|\bpmo\b|\bquan ly du an|\bpm\b|\bpo\b/,
  },
  {
    role: 'ba',
    pattern:
      /\bbusiness (system |systems )?analyst|\b(it |system |systems |functional |requirements? )analyst|\bbusiness process (consultant|analyst)|\bfunctional consultant|\bba\b|\bphan tich (nghiep vu|he thong)|\bbrse\b|\bbridge (system )?engineer/,
  },
  {
    // Before QA, or every penetration tester would land there.
    role: 'security',
    pattern:
      /\bsecurity|\bcyber|\bsoc\b|\bpen(etration)? ?test|\binfosec|\bred team|\bblue team|\bincident response|\bdetection|\bdefen[cs]e\b|\bidentity\b|\biam\b|\bgovernance,? risk|\bgrc\b|\bvapt\b|\biso 27001|\bit governance|\b(ict|it|technology) risk|\bbao mat|\ban ninh mang/,
  },
  {
    role: 'qa',
    pattern: /\bqa\b|\bqc\b|\btest(er|ing)?\b|\bquality (assurance|control|engineer)|\bsdet\b|\bkiem thu/,
  },
  {
    role: 'data',
    pattern:
      /\bdata\b(?! cent(er|re))|\bmachine learning|\bml\b|\bmlops|\bai\b|\bdeep learning|\bbi\b|\bbusiness intelligence|\banalytics|\bdu lieu|\bllm\b|\bnlp\b|\bcomputer vision/,
  },
  {
    role: 'devops',
    pattern:
      /\bdevops|\bdevsecops|\bsre\b|\bsite reliability|\bcloud\b|\bplatform engineer|\binfrastructure|\binfra\b|\bdata cent(er|re)|\bsys ?admin|\badministrator\b|\bsystems? engineer|\bnetwork|\bkubernetes|\bdba\b|\bquan tri (he thong|mang)|\bhelp ?desk|\bservice desk|\bit support|\bsolutions? architect/,
  },
  {
    // No bare "engineer": sales, field and support engineers are not developers.
    role: 'developer',
    pattern:
      /\bdevelop(er|ment)|\bprogrammer|\bsoftware|\b(front|back) ?end|\bfull ?stack|\bmobile|\bios\b|\bandroid|\bweb\b|\blap trinh|\bdev\b|\b(java|python|golang|php|node|react|c#|c\+\+)(?![a-z0-9])|\.net\b/,
  },
];

/** Filter choices, broadest first, in the order a reader scans for their own role. */
export const ROLE_OPTIONS: Array<{ value: JobRole | 'all'; label: string }> = [
  { value: 'all', label: 'All roles' },
  ...(['developer', 'devops', 'data', 'security', 'qa', 'ba', 'pm', 'other'] as JobRole[]).map(
    (role) => ({ value: role, label: ROLE_LABELS[role] }),
  ),
];
