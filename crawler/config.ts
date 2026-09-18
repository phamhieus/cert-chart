// Side-effect import: makes .env available to every crawler entry point.
import './util/env';

/**
 * Crawl configuration. Every source is opt-in and rate limited on purpose:
 * `robots.txt` is honoured (see `util/http.ts`), concurrency stays low, and each
 * run is capped so a first crawl finishes in minutes rather than hours.
 *
 * Before enabling a new source, check its robots.txt and terms of service.
 */
export interface SourceConfig {
  enabled: boolean;
  /** Hard cap on records kept per run. */
  maxRecords: number;
}

/** A source that can only be read by driving a real browser. */
export interface BrowserSourceConfig extends SourceConfig {
  /** How many certifications to search for, one navigation each. */
  searchTerms: number;
  maxDetailPages: number;
  /** Minimum gap between navigations — bot checks trip on quick page loads. */
  navigationDelayMs: number;
  /** Extra settling time after load, for results that arrive with the app. */
  settleMs: number;
}

export interface TrainingCenter {
  id: string;
  name: string;
  url: string;
  /** Pages that actually list courses; each was checked before being added. */
  listUrls: string[];
}

export interface CrawlConfig {
  userAgent: string;
  requestDelayMs: number;
  maxConcurrency: number;
  respectRobotsTxt: boolean;
  /**
   * How far back a source is asked to reach when its API lets us say. Job boards
   * only ever show live postings, so this really bites on the community sources,
   * which is where the trend lines come from.
   */
  historyYears: number;
  sources: {
    itviec: SourceConfig & { listPages: number; maxRequests: number };
    topcv: BrowserSourceConfig;
    careerviet: BrowserSourceConfig;
    vieclam24h: SourceConfig & {
      occupations: string[];
      sitemapFiles: number;
      maxDetailPages: number;
    };
    weworkremotely: SourceConfig & { feeds: string[] };
    remoteok: SourceConfig;
    remotive: SourceConfig & { resultsPerTerm: number };
    arbeitnow: SourceConfig & { pages: number };
    tokyodev: SourceConfig & { maxDetailPages: number };
    mycareersfuture: SourceConfig & { resultsPerCert: number; detailsPerCert: number };
    zenn: SourceConfig & {
      topics: string[];
      pagesPerTopic: number;
      /** Aliases searched per certification — this is the keyword pass. */
      termsPerCert: number;
      pagesPerTerm: number;
      /** Article bodies read to verify a hit whose title says nothing. */
      maxDetailPages: number;
    };
    viblo: SourceConfig;
    daynhauhoc: SourceConfig & {
      pages: number;
      /** Threads opened when the title names no certification. */
      maxTopicBodies: number;
    };
    devto: SourceConfig & {
      tags: string[];
      pagesPerTag: number;
      resultsPerPage: number;
      /** Gap between listing calls — DEV answers 429 at the global delay. */
      pauseMs: number;
    };
    hackernews: SourceConfig & {
      termsPerCert: number;
      pagesPerTerm: number;
      resultsPerPage: number;
      /** Comments carry most of the opinion on an exam; stories carry the metrics. */
      includeComments: boolean;
    };
    reddit: SourceConfig & { subredditMarkets: Array<{ name: string; market: string }> };
    voz: SourceConfig & { forumUrls: string[] };
    stackoverflow: SourceConfig & { termsPerCert: number; resultsPerTerm: number };
    stackexchange: SourceConfig & {
      /** API `site` parameters beyond stackoverflow.com. */
      sites: string[];
      termsPerCert: number;
      resultsPerTerm: number;
    };
    github: SourceConfig & { termsPerCert: number; resultsPerCert: number; maxRequests: number };
    officialCourses: SourceConfig;
    coursera: SourceConfig & { sitemaps: string[]; coursesPerCert: number };
    udemy: SourceConfig & { resultsPerCert: number };
    trainingCenters: SourceConfig & { maxCoursePages: number; centers: TrainingCenter[] };
    vendorHolders: SourceConfig & { vendorPages: Array<{ vendor: string; url: string }> };
  };
}

export const CRAWL_CONFIG: CrawlConfig = {
  userAgent: 'it-cert-ranking/0.1 (research crawler; set-your-contact@example.com)',
  requestDelayMs: 900,
  maxConcurrency: 2,
  respectRobotsTxt: true,
  historyYears: 3,
  sources: {
    // Vietnam jobs. Detail pages publish schema.org JobPosting data.
    itviec: {
      enabled: true,
      maxRecords: 200_000,
      listPages: 12,
      // The single biggest lever on how much ITviec data a run keeps.
      maxRequests: 600,
    },
    // Vietnam jobs. Cloudflare-gated end to end, so this one drives a browser
    // (npx playwright install chromium). Pacing is slow on purpose: a handful of
    // quick navigations is enough to earn an "Attention Required" page.
    topcv: {
      enabled: true,
      maxRecords: 200_000,
      searchTerms: 20,
      // Each page is a browser navigation at 6s, so this dominates its runtime.
      maxDetailPages: 150,
      navigationDelayMs: 6_000,
      settleMs: 2_500,
    },
    // Vietnam jobs. Only the result list needs the browser; detail pages are
    // server-rendered and fetched over plain HTTP.
    careerviet: {
      enabled: true,
      maxRecords: 200_000,
      searchTerms: 20,
      // Only the 20 searches use the browser; these are plain HTTP fetches.
      maxDetailPages: 500,
      navigationDelayMs: 4_000,
      settleMs: 4_000,
    },
    // Vietnam jobs. Search is client-side and `?q=` URLs are disallowed, so the
    // sitemap is the entry point: the occupation is in every posting's slug.
    vieclam24h: {
      enabled: true,
      maxRecords: 200_000,
      occupations: ['it-phan-mem', 'it-phan-cung-mang', 'khoa-hoc-ky-thuat', 'quan-ly-du-an'],
      sitemapFiles: 12,
      // ~3s per posting: this is the slowest source per record in the set.
      maxDetailPages: 450,
    },
    // Global / remote jobs via public RSS feeds.
    weworkremotely: {
      enabled: true,
      maxRecords: 200_000,
      feeds: [
        'https://weworkremotely.com/remote-jobs.rss',
        'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
        'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
        'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
        'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
        'https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss',
        'https://weworkremotely.com/categories/remote-product-jobs.rss',
      ],
    },
    // Global remote jobs. The whole board arrives as one JSON document.
    // Its API terms require a followed link back to each posting — the job rows
    // and the Data sources dialog already provide it.
    remoteok: {
      enabled: true,
      maxRecords: 200_000,
    },
    // Global remote jobs. Public API with a search term, asked once per
    // certification name and once per short name.
    remotive: {
      enabled: true,
      maxRecords: 200_000,
      resultsPerTerm: 50,
    },
    // Europe. No search endpoint, so the feed is paged through; 250 per page.
    arbeitnow: {
      enabled: true,
      maxRecords: 200_000,
      pages: 8,
    },
    // Japan. The big Japanese boards refuse non-browser requests, leaving the
    // market with community activity and no demand data until this source.
    tokyodev: {
      enabled: true,
      maxRecords: 200_000,
      maxDetailPages: 200,
    },
    // Singapore jobs. Government job portal with an open search API.
    mycareersfuture: {
      enabled: true,
      maxRecords: 200_000,
      resultsPerCert: 50,
      detailsPerCert: 20,
    },
    // Japan community. Keyword search over article text first, topic listings
    // second — a topic is a tag the author picked, not a mention.
    zenn: {
      enabled: true,
      maxRecords: 200_000,
      topics: [
        'aws',
        'aws認定',
        'azure',
        'googlecloud',
        'kubernetes',
        'devops',
        'terraform',
        'security',
        'certification',
      ],
      pagesPerTopic: 10,
      termsPerCert: 3,
      pagesPerTerm: 3,
      // Each one is a request; only spent when a search hit's title is silent.
      maxDetailPages: 400,
    },
    // Vietnam community. Only a "newest posts" RSS feed is public, so coverage
    // builds up run by run rather than in one pass.
    viblo: {
      enabled: true,
      maxRecords: 200_000,
    },
    // Vietnam community. Discourse forum, public JSON listings. Thread bodies
    // are read when the title names nothing — most Vietnamese threads name the
    // exam in the post, not the title.
    daynhauhoc: {
      enabled: true,
      maxRecords: 200_000,
      pages: 40,
      maxTopicBodies: 400,
    },
    // Global community. Forem's search endpoint is disallowed by robots.txt, so
    // tags find the candidates and the article text decides what counts.
    devto: {
      enabled: true,
      maxRecords: 200_000,
      tags: [
        'aws',
        'azure',
        'googlecloud',
        'kubernetes',
        'devops',
        'terraform',
        'security',
        'cybersecurity',
        'networking',
        'linux',
        'cloud',
        'certification',
        'career',
      ],
      pagesPerTag: 5,
      // 1000 is the API's ceiling; 100 keeps each response small.
      resultsPerPage: 100,
      pauseMs: 2_500,
    },
    // Global community. Public Algolia index behind HN's own search box — no
    // key, no robots.txt, full text across stories and comments.
    hackernews: {
      enabled: true,
      maxRecords: 200_000,
      termsPerCert: 2,
      pagesPerTerm: 3,
      resultsPerPage: 100,
      includeComments: true,
    },
    // Reddit bans crawlers in robots.txt, so this needs the official API:
    // set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (script app) to enable it.
    reddit: {
      enabled: true,
      maxRecords: 200_000,
      subredditMarkets: [
        { name: 'vozforums', market: 'vietnam' },
        { name: 'VietNam', market: 'vietnam' },
        { name: 'singapore', market: 'singapore' },
        { name: 'japanlife', market: 'japan' },
        { name: 'AWSCertifications', market: 'global' },
        { name: 'ccna', market: 'global' },
        { name: 'kubernetes', market: 'global' },
        { name: 'devops', market: 'global' },
        { name: 'cybersecurity', market: 'global' },
      ],
    },
    // VOZ sits behind a Cloudflare challenge, so plain HTTP requests get a 403.
    // Enabling it means driving a real browser (Playwright) yourself.
    voz: {
      enabled: false,
      maxRecords: 200_000,
      forumUrls: [],
    },
    // Global community. Stack Exchange's public API — no key needed; setting
    // STACK_APP_KEY only raises the daily quota from 300 to 10,000 calls.
    stackoverflow: {
      enabled: true,
      maxRecords: 200_000,
      termsPerCert: 3,
      // 100 is the API's own page-size ceiling.
      resultsPerTerm: 100,
    },
    // Global community. The rest of the Stack Exchange network, same API and
    // the same daily quota — certification talk is spread far wider than
    // stackoverflow.com.
    // Three sites at two terms each is ~120 calls, which fits under the 300/day
    // anonymous quota alongside the Stack Overflow pass. STACK_APP_KEY raises the
    // ceiling to 10,000 and this can then be widened.
    stackexchange: {
      enabled: true,
      maxRecords: 200_000,
      sites: ['serverfault', 'security', 'devops'],
      termsPerCert: 2,
      resultsPerTerm: 100,
    },
    // Global community. Search is limited per minute, not per hour: 10 calls
    // unauthenticated, 30 with GITHUB_TOKEN set.
    github: {
      enabled: true,
      maxRecords: 200_000,
      termsPerCert: 2,
      // 100 is the API's own page-size ceiling.
      resultsPerCert: 100,
      // Each call costs 6.5s unauthenticated, 2.1s with GITHUB_TOKEN.
      maxRequests: 40,
    },
    officialCourses: {
      enabled: true,
      maxRecords: 200_000,
    },
    // Global courses. `/api/` and `/search` are disallowed, so discovery runs off
    // the sitemaps; credential-shaped pages are listed first on purpose.
    coursera: {
      enabled: true,
      maxRecords: 200_000,
      sitemaps: ['certificates', 'specializations', 'courses'],
      coursesPerCert: 15,
    },
    // Global courses. Affiliate API only — needs UDEMY_CLIENT_ID and
    // UDEMY_CLIENT_SECRET from Udemy's affiliate programme.
    udemy: {
      enabled: true,
      maxRecords: 200_000,
      resultsPerCert: 50,
    },
    // Vietnam courses. No aggregator exists, so each centre is listed by hand.
    // Every URL below was checked to serve a course list that names tracked
    // certifications — add a centre only after confirming the same.
    trainingCenters: {
      enabled: true,
      maxRecords: 200_000,
      maxCoursePages: 200,
      centers: [
        {
          id: 'vnpro',
          name: 'VnPro',
          url: 'https://www.vnpro.vn',
          listUrls: ['https://www.vnpro.vn/'],
        },
        {
          id: 'robusta',
          name: 'Robusta',
          url: 'https://robusta.vn',
          listUrls: ['https://robusta.vn/'],
        },
        {
          id: 'athena',
          name: 'Trung tâm Athena',
          url: 'https://athena.edu.vn',
          listUrls: ['https://athena.edu.vn/', 'https://athena.edu.vn/khoa-hoc'],
        },
        {
          id: 'vti-academy',
          name: 'VTI Academy',
          url: 'https://vtiacademy.edu.vn',
          listUrls: ['https://vtiacademy.edu.vn/'],
        },
      ],
    },
    // How many people hold a certification. Vendors publish this for their whole
    // programme far more often than per exam, so most of what comes back is
    // vendor-wide and is stored as such — see crawler/holders/vendorPages.ts.
    // These are the programme overview pages; each certification's own page is
    // read too, straight from the dictionary.
    vendorHolders: {
      enabled: true,
      maxRecords: 200_000,
      vendorPages: [
        { vendor: 'AWS', url: 'https://aws.amazon.com/certification/' },
        { vendor: 'Microsoft', url: 'https://learn.microsoft.com/en-us/credentials/' },
        {
          vendor: 'Cisco',
          url: 'https://www.cisco.com/site/us/en/learn/training-certifications/certifications/index.html',
        },
        {
          vendor: 'Linux Foundation / CNCF',
          url: 'https://training.linuxfoundation.org/certification/',
        },
        { vendor: 'ISC2', url: 'https://www.isc2.org/about' },
        { vendor: 'CompTIA', url: 'https://www.comptia.org/en-us/certifications/' },
        { vendor: 'EC-Council', url: 'https://www.eccouncil.org/train-certify/' },
        { vendor: 'Google Cloud', url: 'https://cloud.google.com/learn/certification' },
        { vendor: 'HashiCorp', url: 'https://developer.hashicorp.com/certifications' },
        { vendor: 'Oracle', url: 'https://education.oracle.com/certification' },
        { vendor: 'PMI', url: 'https://www.pmi.org/certifications/project-management-pmp' },
        { vendor: 'Scrum.org', url: 'https://www.scrum.org/professional-scrum-certifications' },
      ],
    },
  },
};
