import type { CommunityCrawler } from '../../types';
import { crawlStackSites } from './client';

/**
 * Stack Overflow through the official Stack Exchange API — no scraping, and the
 * API is public, so this needs no credentials. `STACK_APP_KEY` only raises the
 * quota from 300 to 10,000 calls a day.
 */
export const stackOverflowCrawler: CommunityCrawler = {
  id: 'stackoverflow',
  name: 'Stack Overflow',
  url: 'https://stackoverflow.com',
  type: 'community',

  isEnabled: (config) => config.sources.stackoverflow.enabled,

  run: (context) =>
    crawlStackSites(
      {
        sites: ['stackoverflow'],
        sourceName: 'Stack Overflow',
        // Unchanged from the single-site crawler, so earlier records merge
        // rather than duplicating under a new id.
        recordId: (_site, questionId, certificationId) => `so_${questionId}_${certificationId}`,
        settings: context.config.sources.stackoverflow,
      },
      context,
    ),
};

/**
 * The rest of the Stack Exchange network. Certification questions are spread far
 * wider than stackoverflow.com: Server Fault carries the networking exams,
 * Information Security the CISSP and Security+ discussion, DevOps the Kubernetes
 * and Terraform ones. Same API, same quota pool, one extra crawler.
 *
 * Every record is filed under one source name so provenance counts stay per
 * crawler; the link on each record names the site it came from.
 */
export const stackExchangeCrawler: CommunityCrawler = {
  id: 'stackexchange',
  name: 'Stack Exchange',
  url: 'https://stackexchange.com',
  type: 'community',

  isEnabled: (config) => config.sources.stackexchange.enabled,

  run: (context) =>
    crawlStackSites(
      {
        sites: context.config.sources.stackexchange.sites,
        sourceName: 'Stack Exchange',
        recordId: (site, questionId, certificationId) => `se_${site}_${questionId}_${certificationId}`,
        settings: context.config.sources.stackexchange,
      },
      context,
    ),
};
