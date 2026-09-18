import type { HolderReport } from '../../src/types';
import { findCertificationsInText } from '../../src/utils/certAliases';
import { stripHtml } from '../normalize/jobPosting';
import type { CrawlContext, HolderCrawler } from '../types';
import { fetchText } from '../util/http';

/**
 * Words that mean a number in the same sentence is about demand, money or exam
 * mechanics rather than people holding the credential. Without this, "700,000
 * job openings" and "less than 10 people" (a pricing tier) both read as holder
 * counts — both were produced by an earlier version of this matcher.
 */
const NOT_A_POPULATION =
  /\bjob|opening|vacanc|salary|pay\b|hiring|demand|growth|revenue|employer|compan|question|minute|hour|price|cost|usd|\$|discount|quote|seat/i;

/**
 * A stated ambition is not a population. Cisco's certification page says "we aim
 * to train over 10 million more people in the next 30 years" — a pledge about
 * 2056, which an earlier version of this crawler recorded as a holder count.
 */
const NOT_YET_TRUE =
  /\baim\b|\bgoal\b|pledge|target|aspire|commit|\bplan to\b|\bwill\b|\bby 20\d\d\b|next \d+ years|we hope|on track/i;

/** "1.05 million" → 1050000, "270,000" → 270000, "1.7M" → 1700000. */
function parseCount(digits: string, unit: string | undefined): number | null {
  const base = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(base) || base <= 0) return null;
  const scale = /^(million|m)$/i.test(unit ?? '')
    ? 1_000_000
    : /^(thousand|k)$/i.test(unit ?? '')
      ? 1_000
      : 1;
  // A bare four-digit number in this range is a year — "Pearson VUE, 2025 Value
  // of IT Certification Report" is a citation, not a population.
  if (scale === 1 && !digits.includes(',') && base >= 1_900 && base <= 2_100) return null;
  const total = Math.round(base * scale);
  // A three-figure "population" is a page artefact, not a certified community.
  return total >= 1_000 ? total : null;
}

/** Words for people, and the separate case of counting credentials issued. */
const PEOPLE =
  String.raw`certified\s+(?:professionals?|individuals?|learners?|people|members?)|` +
  String.raw`(?:certification\s+)?holders?|earners?|professionals?|individuals?|members?|people`;
const CREDENTIALS = String.raw`certifications?|certificates?`;

const POPULATION = new RegExp(
  // number, optional scale word (anchored — unanchored, the "m" of "months"
  // matches it), up to three filler words, then what is being counted
  String.raw`\b([\d][\d.,]*)\s*(million|thousand|m|k)?\b\s*\+?\s*` +
    String.raw`(?:active\s+|unique\s+|currently\s+)?(?:[A-Za-z][\w-]*\s+){0,3}?` +
    `(${PEOPLE}|${CREDENTIALS})\\b`,
  // Global, because a vendor often states both counts in one breath — "1.42
  // million active AWS Certifications and 1.05 million unique AWS Certified
  // individuals" — and stopping at the first match picks the wrong one.
  'gi',
);

/**
 * Whether a match counts people or credentials issued. One person can hold
 * several exams, so "4 million certifications issued" is not four million
 * people — the distinction is kept rather than flattened.
 */
function countsOf(noun: string): 'people' | 'certifications' {
  return new RegExp(`^(?:${CREDENTIALS})$`, 'i').test(noun.trim()) ? 'certifications' : 'people';
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|(?<=\))\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 20 && part.length <= 300);
}

/**
 * Reads certified-population figures off the pages the vendors themselves
 * publish.
 *
 * Worth knowing before trusting the output: almost no vendor publishes a
 * per-exam number. AWS publishes "1.05 million unique AWS Certified
 * individuals" across all its exams; EC-Council publishes "4 Million Certified
 * Learners" across all of its. Those are real figures and are stored, but as
 * `scope: 'vendor'` — the ranking never treats them as the holder count of one
 * certification, because they are not. A figure is only scoped to a
 * certification when the sentence carrying it names that certification.
 *
 * Nothing here is hand-entered. A vendor that publishes no number produces no
 * record, which is why this file cannot drift out of date the way a curated
 * table of numbers would.
 */
export const vendorHoldersCrawler: HolderCrawler = {
  id: 'vendor-holders',
  name: 'Vendor certification pages',
  url: '',
  type: 'certification-body',
  // Every vendor page is re-read each run, so the run is the whole truth. A
  // number that can no longer be found on the vendor's own page stops being
  // shown rather than lingering from an earlier, looser pass.
  replaces: true,

  isEnabled: (config) => config.sources.vendorHolders.enabled,

  async run({ config, certifications, aliasIndex, now, log }: CrawlContext): Promise<HolderReport[]> {
    const settings = config.sources.vendorHolders;
    const crawledAt = now.toISOString();
    const reports = new Map<string, HolderReport>();

    // Each certification's own page, plus the vendor-wide overview pages, which
    // is where the big numbers are usually printed.
    const targets = new Map<string, string>();
    for (const cert of certifications) targets.set(cert.officialUrl, cert.vendor);
    for (const page of settings.vendorPages) targets.set(page.url, page.vendor);

    let read = 0;
    for (const [url, vendor] of targets) {
      let html: string;
      try {
        html = await fetchText(url, { timeoutMs: 40_000, retries: 1 });
      } catch (error) {
        // 403s are common here: several vendors block non-browser clients. A
        // page we cannot read yields no figure rather than a guessed one.
        log(`Holders: ${vendor} — ${url} unreadable (${(error as Error).message})`);
        continue;
      }
      read += 1;

      for (const sentence of sentences(stripHtml(html))) {
        if (NOT_A_POPULATION.test(sentence) || NOT_YET_TRUE.test(sentence)) continue;

        // Scope is decided by the sentence, not by which page it sat on.
        const named = findCertificationsInText(sentence, aliasIndex);
        const certificationId = named.length === 1 ? named[0].certificationId : null;
        const id = `holders_${certificationId ?? vendor.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

        for (const match of sentence.matchAll(POPULATION)) {
          const holders = parseCount(match[1], match[2]);
          if (holders === null) continue;
          const counts = countsOf(match[3]);

          const existing = reports.get(id);
          if (existing) {
            // A count of people beats a count of credentials even when it is the
            // smaller number: AWS states 1.42M certifications and 1.05M
            // individuals in one breath, and the question here is how many
            // people hold the credential.
            const better =
              (counts === 'people' && existing.counts === 'certifications') ||
              (counts === existing.counts && holders > existing.holders);
            if (!better) continue;
          }

          reports.set(id, {
            id,
            certificationId,
            vendor,
            holders,
            counts,
            scope: certificationId ? 'certification' : 'vendor',
            statement: sentence,
            source: { name: vendor, url },
            crawledAt,
          });
        }
      }
    }

    // This crawler replaces the file, so an empty result wipes it. Reading no
    // page at all is a broken run, not a world without published figures —
    // failing here leaves the previous figures in place.
    if (read === 0) throw new Error(`no vendor page was readable (${targets.size} tried)`);

    const perCert = [...reports.values()].filter((r) => r.scope === 'certification').length;
    log(
      `Holders: ${reports.size} published figures from ${read} readable pages ` +
        `(${perCert} tied to one certification, ${reports.size - perCert} vendor-wide)`,
    );
    return [...reports.values()].slice(0, settings.maxRecords);
  },
};
