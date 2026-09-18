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

export interface GreenhouseBoard {
  /** The board token in `boards-api.greenhouse.io/v1/boards/{token}/...`. */
  token: string;
  /** Display name stored on each job's `source` — every job from this crawler
   *  shares one `source.name` ("Greenhouse"), same as Zenn or GitHub share one
   *  name across many authors/repos, so `company` is the only per-board field. */
  company: string;
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
    himalayas: SourceConfig & { pages: number };
    greenhouse: SourceConfig & { boards: GreenhouseBoard[] };
    tokyodev: SourceConfig & { maxDetailPages: number };
    mycareersfuture: SourceConfig & { resultsPerCert: number; detailsPerCert: number };
    zenn: SourceConfig & { topics: string[]; pagesPerTopic: number };
    viblo: SourceConfig;
    daynhauhoc: SourceConfig & { pages: number };
    reddit: SourceConfig & { subredditMarkets: Array<{ name: string; market: string }> };
    /** `forums` are VOZ forum slugs — `lap-trinh-cntt.91` — read as RSS. */
    voz: SourceConfig & { forums: string[] };
    quantrimang: SourceConfig & { searchTerms: string[]; maxArticlePages: number };
    /** `sites` are Stack Exchange site slugs — `stackoverflow`, `serverfault`,
     *  `security`, `pm`, … — queried with the same API and the same quota. */
    stackoverflow: SourceConfig & { termsPerCert: number; resultsPerTerm: number; sites: string[] };
    github: SourceConfig & { termsPerCert: number; resultsPerCert: number; maxRequests: number };
    devto: SourceConfig & { tags: string[]; pagesPerTag: number };
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
      maxRecords: 1_200,
      listPages: 12,
      // The single biggest lever on how much ITviec data a run keeps.
      maxRequests: 600,
    },
    // Vietnam jobs. Cloudflare-gated end to end, so this one drives a browser
    // (npx playwright install chromium). Pacing is slow on purpose: a handful of
    // quick navigations is enough to earn an "Attention Required" page.
    topcv: {
      enabled: true,
      maxRecords: 600,
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
      maxRecords: 900,
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
      maxRecords: 900,
      occupations: ['it-phan-mem', 'it-phan-cung-mang', 'khoa-hoc-ky-thuat', 'quan-ly-du-an'],
      sitemapFiles: 12,
      // ~3s per posting: this is the slowest source per record in the set.
      maxDetailPages: 450,
    },
    // Global / remote jobs via public RSS feeds.
    weworkremotely: {
      enabled: true,
      maxRecords: 600,
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
      maxRecords: 600,
    },
    // Global remote jobs. Public API with a search term, asked once per
    // certification name and once per short name.
    remotive: {
      enabled: true,
      maxRecords: 600,
      resultsPerTerm: 50,
    },
    // Europe. No search endpoint, so the feed is paged through; 250 per page.
    arbeitnow: {
      enabled: true,
      maxRecords: 600,
      pages: 8,
    },
    // Global remote jobs. Cursor-paginated JSON feed, no search endpoint either
    // — added alongside Remote OK/Remotive/Arbeitnow rather than instead of any
    // of them, since each board's postings barely overlap.
    himalayas: {
      enabled: true,
      maxRecords: 300,
      pages: 8,
    },
    // Global jobs via the Greenhouse ATS's public job-board API — one request
    // per company returns every open posting with its full HTML description,
    // no search or auth needed (`robots.txt` on boards-api.greenhouse.io
    // disallows only `/embed/`). Every token below was checked to resolve and
    // return jobs before being added; this is a hand-picked slice of mostly
    // US-based security/infra/cloud employers, so it widens the global bucket
    // rather than the Vietnam one.
    greenhouse: {
      enabled: true,
      maxRecords: 300,
      boards: [
        { token: 'cloudflare', company: 'Cloudflare' },
        { token: 'elastic', company: 'Elastic' },
        { token: 'okta', company: 'Okta' },
        { token: 'databricks', company: 'Databricks' },
        { token: 'gitlab', company: 'GitLab' },
        { token: 'coinbase', company: 'Coinbase' },
        { token: 'samsara', company: 'Samsara' },
        { token: 'twilio', company: 'Twilio' },
        { token: 'dropbox', company: 'Dropbox' },
        { token: 'robinhood', company: 'Robinhood' },
        { token: 'reddit', company: 'Reddit' },
      ],
    },
    // Japan. The big Japanese boards refuse non-browser requests, leaving the
    // market with community activity and no demand data until this source.
    tokyodev: {
      enabled: true,
      maxRecords: 400,
      maxDetailPages: 200,
    },
    // Singapore jobs. Government job portal with an open search API.
    mycareersfuture: {
      enabled: true,
      maxRecords: 900,
      resultsPerCert: 50,
      detailsPerCert: 20,
    },
    // Japan community. Public article API, one pass per topic.
    zenn: {
      enabled: true,
      maxRecords: 1_200,
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
    },
    // Vietnam community. Only a "newest posts" RSS feed is public, so coverage
    // builds up run by run rather than in one pass.
    viblo: {
      enabled: true,
      maxRecords: 600,
    },
    // Vietnam community. Discourse forum, public JSON listings.
    daynhauhoc: {
      enabled: true,
      maxRecords: 1_200,
      pages: 40,
    },
    // Reddit bans crawlers in robots.txt, so this needs the official API:
    // set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (script app) to enable it.
    reddit: {
      enabled: true,
      maxRecords: 600,
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
    // Vietnam community. VOZ's HTML sits behind a Cloudflare challenge that
    // answers 403 to `fetch`, but each forum's `/index.rss` is served normally
    // and carries the opening post, so this needs no browser — see
    // crawler/communities/voz.ts. Each feed is the 20 newest threads, so
    // coverage accumulates run by run. These are the forums where Vietnamese
    // IT people actually discuss certifications and careers; the consumer-tech
    // forums were measured and name a certification essentially never.
    voz: {
      enabled: true,
      maxRecords: 300,
      forums: [
        'lap-trinh-cntt.91',
        'tuyen-dung-tim-viec.95',
        'phan-mem.13',
        'server-nas-render-farm.83',
        'thiet-bi-ngoai-vi-phu-kien-mang.30',
        'ai.42',
      ],
    },
    // Vietnam community. `quantrimang.com/{term}` is the site's search, and
    // robots.txt is a bare `Allow: /`. Editorial articles rather than forum
    // threads — see crawler/communities/quantrimang.ts. One extra request per
    // article buys its real publish date, which the search results omit.
    quantrimang: {
      enabled: true,
      maxRecords: 400,
      // The site's search takes a single alphanumeric token and answers 400 to
      // anything else, so these are vendor and technology words rather than
      // exam names — the alias check decides what actually counts. Result
      // counts measured when the list was picked: cisco 196, security 362,
      // oracle 162, azure 56, pmp 54, ccna 39, aws 23, pentest 11, kubernetes
      // 6, cissp 5, terraform 3, comptia 2, ceh 2.
      searchTerms: [
        'ccna',
        'ccnp',
        'cisco',
        'cissp',
        'comptia',
        'security',
        'ceh',
        'pentest',
        'aws',
        'azure',
        'kubernetes',
        'terraform',
        'oracle',
        'pmp',
      ],
      maxArticlePages: 120,
    },
    // Global community. Stack Exchange's public API — no key needed; setting
    // STACK_APP_KEY raises the daily quota from 300 to 10,000 calls, which
    // matters more now than it used to: `sites` fans one crawler out across
    // several Stack Exchange properties (each cert is searched on every site
    // listed), so the call count is `sites.length * certs * termsPerCert`.
    // serverfault/security/pm were picked because they measurably out-covered
    // stackoverflow.com for networking, security and PM certifications —
    // superuser and softwareengineering were tried and left out for low yield.
    stackoverflow: {
      enabled: true,
      maxRecords: 2_000,
      termsPerCert: 2,
      // 100 is the API's own page-size ceiling.
      resultsPerTerm: 100,
      sites: ['stackoverflow', 'serverfault', 'security', 'pm'],
    },
    // Global community. Search is limited per minute, not per hour: 10 calls
    // unauthenticated, 30 with GITHUB_TOKEN set.
    github: {
      enabled: true,
      maxRecords: 2_000,
      termsPerCert: 2,
      // 100 is the API's own page-size ceiling.
      resultsPerCert: 100,
      // Each call costs 6.5s unauthenticated, 2.1s with GITHUB_TOKEN.
      maxRequests: 40,
    },
    // Global community. Public API, no key needed. `tag=certification` is
    // where certification write-ups actually cluster; `aws`/`azure`/`kubernetes`
    // catch posts that name a cert without using that tag. The feed isn't
    // reliably newest-first (unlike Zenn's), so this pages a fixed count
    // instead of stopping at a date cutoff.
    devto: {
      enabled: true,
      maxRecords: 600,
      tags: ['certification', 'aws', 'azure', 'kubernetes', 'cybersecurity'],
      pagesPerTag: 3,
    },
    officialCourses: {
      enabled: true,
      maxRecords: 100,
    },
    // Global courses. `/api/` and `/search` are disallowed, so discovery runs off
    // the sitemaps; credential-shaped pages are listed first on purpose.
    coursera: {
      enabled: true,
      maxRecords: 600,
      sitemaps: ['certificates', 'specializations', 'courses'],
      coursesPerCert: 15,
    },
    // Global courses. Affiliate API only — needs UDEMY_CLIENT_ID and
    // UDEMY_CLIENT_SECRET from Udemy's affiliate programme.
    udemy: {
      enabled: true,
      maxRecords: 600,
      resultsPerCert: 50,
    },
    // Vietnam courses. No aggregator exists, so each centre is listed by hand.
    // Every URL below was checked to serve a course list that names tracked
    // certifications — add a centre only after confirming the same.
    trainingCenters: {
      enabled: true,
      maxRecords: 400,
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
      maxRecords: 60,
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
