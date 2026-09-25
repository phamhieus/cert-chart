# IT Certification Market — Vietnam & APAC

A single-page dashboard ranking IT certifications by **job demand**, **community activity**,
**published holder counts** and **growth**. Vietnam is the primary market (Hanoi, HCMC, Da Nang);
Singapore, Japan and Global/Remote are tracked for comparison.

No backend, no fabricated data: everything is crawled from public sources into JSON under
`public/data`, and every number traces back to the posting, thread or course page it came from.

```bash
npm install
npm run dev          # http://localhost:5173 — crawls on first visit if no data exists
```

## Data flow

```
crawler/        → public/data/*.json → React dashboard
  jobs/                jobs.json
  communities/         community.json
  courses/             courses.json
  dictionary/          certifications.json
  aggregate/           rankings.json   (pre-computed scores)
                       sources.json    (crawl provenance)
```

The repo ships **empty** data files. On first visit the app asks the local crawl API to run a crawl
and shows live progress; later visits read the stored JSON. A first crawl takes a few minutes —
sources are rate limited on purpose. Raise the caps in `crawler/config.ts` for a deeper sweep.
Crawls **merge** by record id, so repeated runs accumulate history instead of replacing it.

The crawl API is served by the Vite dev server (and by `npm run serve` for a built app):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/dataset` | record counts and last crawl instant |
| `GET /api/crawl` | current crawl progress |
| `POST /api/crawl` | start a crawl (optional `?sources=itviec,zenn`) |

A static deployment (S3, Pages) has no API — run `npm run crawl` before deploying.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + crawl API |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Preview the build (crawl API included) |
| `npm run serve` | Standalone Node server for `dist/` + crawl API |
| `npm run crawl` | Crawl every enabled source, then rebuild rankings |
| `npm run crawl -- itviec zenn` | Crawl only the named sources |
| `npm run aggregate` | Rebuild `rankings.json` from stored records |
| `npm run typecheck` | `tsc -b` across app and crawler |

## Certifications tracked

One hundred certifications are registered in one place — `crawler/dictionary/certifications.ts`. No
crawler matches free text on its own: they all resolve it against each entry's **aliases**, so
`AZ104`, `AZ-104` and `Azure Administrator Associate` land on the same certification.

| Category | # | Certifications |
| --- | --- | --- |
| Cloud | 12 | AWS SAA, AWS CCP, AWS DVA, AWS SOA, AWS SAP, AZ-104, AZ-204, AZ-305, AZ-900, GCP ACE, GCP PCA, GCP CDL |
| Cybersecurity | 20 | CISSP, Security+, CEH, CySA+, PenTest+, SecurityX, CISM, CISA, OSCP, GSEC, GCIH, CCSP, ISC2 CC, AWS Security Specialty, AZ-500, SC-200, SC-300, SC-900, CCNP Security, CyberOps Associate |
| Project Management | 11 | PMP, CAPM, PMI-ACP, PSM I, PSM II, PSPO I, CSM, CSPO, PRINCE2 Foundation, SAFe Agilist, ITIL 4 |
| DevOps | 9 | AWS DevOps Pro, AZ-400, GCP DevOps, Terraform Associate, Vault Associate, RHCSA, RHCE, LFCS, Linux+ |
| Testing | 9 | ISTQB CTFL, CTFL-AT, CTAL-TA, CTAL-TTA, CTAL-TM, CT-TAE, CT-PT, CT-AI, Tricentis Tosca AS1 |
| Data | 8 | DP-203, DP-900, PL-300, AWS DEA, GCP PDE, Databricks DEA, SnowPro Core, Tableau Specialist |
| AI | 7 | AI-102, AI-900, DP-100, AWS MLS, AWS AIF, GCP PMLE, Databricks MLA |
| Business Analysis | 7 | ECBA, CCBA, CBAP, PMI-PBA, IIBA-AAC, IIBA-CBDA, IREB CPRE-FL |
| Networking | 6 | CCNA, CCNP Enterprise, CCIE EI, Network+, AZ-700, AWS ANS |
| Kubernetes | 4 | CKA, CKAD, CKS, KCNA |
| Software Development | 4 | OCP Java 17, PCEP, PCAP, Salesforce Admin |
| Database | 3 | Oracle DBA 19c, DP-300, MongoDB Associate Developer |

Every entry carries its `vendor`, exam `code`, `level` (Foundational → Associate → Professional →
Expert), `aliases` and the `officialUrl` that the course and holder-count crawlers start from.
Adding a certification is one object in that file — every crawler picks it up on the next run.

**Two acronyms collide with common words** and will over-count until the matcher can tell them apart:
`PCAP` is also the packet-capture file format, and `CISA` is also the US Cybersecurity and
Infrastructure Security Agency. Both are heavily used in exactly the security and networking text
these crawlers read, so their community counts run high.

**Dictionary size drives crawl cost.** Sources that search per certification — GitHub, Stack
Exchange, Hacker News, Zenn, Coursera, TopCV, CareerViet — do work proportional to the number of
entries, so the budgets in `crawler/config.ts` were raised alongside this list
(`github.maxRequests`, `topcv.searchTerms`, `careerviet.searchTerms`). A budget left too low does not
fail: the crawl simply stops partway down the dictionary and reports success.

## Sources

Each source is a small module under `crawler/jobs/`, `crawler/communities/` or `crawler/courses/`,
switched on or off in `crawler/config.ts`. All of them honour `robots.txt` (RFC 9309 parser in
`crawler/util/http.ts`: `*` and `$` wildcards, longest match wins, matched against path *and* query
string), send a descriptive user-agent, and are rate limited by `CRAWL_CONFIG.requestDelayMs`.
Sources reached through an authorised API with credentials — Reddit and Udemy — call `fetch`
directly, because a key issued by the site is permission, not crawling.

| Source | Market | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| ITviec | Vietnam | Jobs | on | Detail pages publish schema.org `JobPosting`; capped by `sources.itviec.maxRequests` |
| TopCV | Vietnam | Jobs | needs browser | Cloudflare-gated end to end — drives Playwright |
| CareerViet | Vietnam | Jobs | needs browser | Result list is client-side (its API is disallowed); detail pages go over plain HTTP |
| Vieclam24h | Vietnam | Jobs | on | `?q=` URLs are disallowed, so postings come from the sitemap, filtered to IT occupations by slug |
| MyCareersFuture | Singapore | Jobs | on | Government portal, public search API |
| TokyoDev | Japan | Jobs | on | English-language board for roles in Japan; sitemap → schema.org `JobPosting` |
| We Work Remotely | Global | Jobs | on | Public RSS category feeds |
| Remote OK | Global | Jobs | on | Whole board as one JSON document; its terms require a followed link back to each posting |
| Remotive | Global | Jobs | on | Public API, queried per certification |
| Arbeitnow | Europe | Jobs | on | Public API, paged |
| LinkedIn | — | Jobs | never | `robots.txt` prohibits automated access outright; listed so the gap is visible |
| Dạy Nhau Học | Vietnam | Community | on | Discourse `latest.json?order=created` (search is disallowed); threads whose title names nothing are opened and read |
| Viblo | Vietnam | Community | on | Public "newest posts" RSS; coverage builds up run by run |
| Zenn | Japan | Community | on | Keyword search over article text (`/api/search`), then topic listings; bodies fetched to confirm a silent title |
| Stack Overflow | Global | Community | on | `/search/excerpts` proves the certification is named, `/questions` supplies views and answers; `STACK_APP_KEY` only raises the quota |
| Stack Exchange | Global | Community | on | Server Fault, Information Security and DevOps — same API and daily quota as Stack Overflow |
| GitHub | Global | Community | on | REST search API; `GITHUB_TOKEN` raises the limit from 10 to 30 calls/minute |
| Hacker News | Global | Community | on | Public Algolia index behind HN's own search box — full text across stories **and** comments, no key |
| DEV Community | Global | Community | on | Forem tag listings (its search endpoint is disallowed); the article's own title and summary decide what counts |
| Reddit | all | Community | needs keys | `robots.txt` forbids scraping — `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` switch on the official API |
| VOZ | Vietnam | Community | off | Behind a Cloudflare challenge; enable it via `crawler/util/browser.ts` |
| Official vendor training | — | Courses | on | Learning path per certification, link-checked each run |
| Coursera | Global | Courses | on | `/api/` and `/search` are disallowed; discovery runs off the sitemaps and reads each page's `Course` data |
| Udemy | Global | Courses | needs keys | robots.txt blocks `/api-2.0/` and query-string URLs — `UDEMY_CLIENT_ID` / `UDEMY_CLIENT_SECRET` switch on the Affiliate API |
| Vietnamese training centres | Vietnam | Courses | on | VnPro, Robusta, Athena, VTI Academy — listed by hand; each course page is fetched to confirm it resolves |
| Vendor certification pages | — | Holder counts | on | Certified-population figures read off the vendors' own pages |

### Credentials

Copy `.env.example` to `.env` and fill in what you have — `crawler/util/env.ts` loads it for the CLI,
the standalone server and the Vite plugin alike, and anything already exported in the shell wins over
the file. Every variable is optional; a source without its credential is skipped and says why in the
**Data sources** dialog.

| Variable | Effect | Where to get it |
| --- | --- | --- |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Switches Reddit on — `robots.txt` forbids crawling it, so the API is the only route | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → "create another app...", type **script**, redirect uri `http://localhost:8080`. Free, instant. The id is the string under the app name |
| `UDEMY_CLIENT_ID` / `UDEMY_CLIENT_SECRET` | Switches Udemy on — `/api-2.0/` is disallowed, so the Affiliate API is the only route | Apply at [udemy.com/affiliate](https://www.udemy.com/affiliate/), then request a client at [API clients](https://www.udemy.com/user/edit-api-clients/). Manual review, and not always granted |
| `STACK_APP_KEY` | Raises the Stack Exchange quota from 300 to 10,000 calls/day, shared by both Stack crawlers | [stackapps.com/apps/oauth/register](https://stackapps.com/apps/oauth/register). Free, instant, no review — use the **key**, not the client id |
| `GITHUB_TOKEN` | Raises GitHub search from 10 to 30 calls/minute | [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens). Public repository search needs **no scopes** |

**VOZ needs no credential** — it sits behind a Cloudflare challenge, so it needs a real browser
(`crawler/util/browser.ts`) plus `enabled: true` and some `forumUrls` in `crawler/config.ts`.

**Two sources need a real browser.** TopCV and CareerViet render behind a Cloudflare challenge that
no plain HTTP client can clear. `npm install` pulls in Playwright; `npx playwright install chromium`
downloads the browser, and both are skipped with a setup hint until then. The browser sends a Chrome
user-agent to pass the bot check — `robots.txt` allows those paths and every navigation is still
checked against it.

Gaps stay visible rather than filled in: unpublished prices stay `null`, unpublished holder counts
stay absent, and the **Data sources** dialog shows each source's last crawl time, duration, record
count and skip/failure reason.

**Holder counts are programme-wide, not per-exam.** `crawler/holders/vendorPages.ts` keeps a figure
only when the sentence carrying it names the certification, records whether it counts people or
credentials issued, and filters out pledges (Cisco's "10 million over 30 years"). A certification
with no published figure gets a null holder score, and its 20% weight is redistributed. In practice
**no vendor publishes a per-exam population** — AWS states 1.05 million AWS Certified individuals
across every exam it runs, and Credly's badge pages no longer print earner counts (its API needs
credentials) — so the holder column is empty by design rather than by omission.

**Holder figures replace, they do not accumulate.** Every other source merges by record id, because
postings and threads pile up over time. `vendor-holders` re-reads every vendor page on each run, so
the run is the whole truth: its crawler sets `replaces: true` (`crawler/types.ts`) and the pipeline
writes its output over the file. Merging stranded figures that a later, stricter pass had already
rejected — a rejection produces no record to overwrite the old one with, so a misread year survived
three rounds of matcher fixes.

**A mention is a keyword, not a tag.** Every community record is counted by
`countCertificationMentions` over the text a human wrote — a title, a post body, a comment, a repo
description. Tags and topics are a way to *find* candidates on the sources whose search endpoints are
disallowed (DEV, and Zenn's second pass), never evidence in themselves: an article tagged `aws` that
never names an exam contributes nothing. Where a source exposes full-text search — Zenn, Hacker News,
Stack Exchange, Reddit — the crawler searches each certification's aliases directly, and when a hit's
title is silent it reads the body before believing the ranking.

**History** — `CRAWL_CONFIG.historyYears` (3) bounds how far community sources reach; job boards
only publish live postings. Trend series are 36 months (`TREND_MONTHS`), while `growth12m` stays a
12-month measure.

**Caps** — every source's `maxRecords` is 200,000, so it is never the binding limit. What actually
bounds a run is the per-source discovery budget: `maxRequests` (ITviec, GitHub), `pages` /
`pagesPerTerm` / `pagesPerTag`, `maxDetailPages` and `maxTopicBodies`. Those are the knobs to turn
for a deeper sweep, and the ones that decide how long a crawl takes.

### Adding a source

1. Export a `SourceCrawler` (`crawler/types.ts`) from `crawler/jobs|communities|courses/`.
2. Resolve certifications with `extractJobCertifications` / `countCertificationMentions`
   (`crawler/normalize/certifications.ts`) — never hand-roll alias matching.
3. Map places with `resolveLocation` / `marketLocation` (`crawler/normalize/location.ts`).
4. Register it in `crawler/pipeline.ts` and add its config block in `crawler/config.ts`.

## Data conventions

- **Timestamps are instants.** `crawledAt`, `lastChecked`, `lastCrawledAt` are ISO-8601 UTC
  instants; `postedAt` / `publishedAt` stay `YYYY-MM-DD` because that is all sources publish.
- **Locations are never inferred from people.** A record carries a `city` only when the source
  states one; community threads use `scope: "national"` or `"unknown"`.
- **Community is never filtered by region.** A GitHub repository, a Stack Overflow question or a
  Hacker News comment states no author location, so narrowing them by market would drop the corpus
  the moment a reader picks one — and interest in AZ-104 is interest in AZ-104 wherever it was
  written. The region filter applies to jobs and training centres, which do carry a place; the
  community panels say "all markets" so the scope is never in doubt.
- **Nulls are not zeroes.** `views`, `reactions`, `uniqueAuthors` and `price` are `null` when
  unpublished — never a placeholder number.

## Ranking

Weights live in `src/constants/ranking.ts` — the only place scoring constants are defined.

```ts
export const RANKING_WEIGHTS = { jobs: 0.35, community: 0.30, holders: 0.20, growth: 0.15 };
```

- **Jobs** — mentions weighted `required` 1.0 / `preferred` 0.6 / `mentioned` 0.2, log-normalised.
- **Community** — 30% posts, 30% authors, 20% comments, 10% engagement, 10% recent growth.
- **Holders** — only for certifications with a real published figure; otherwise redistributed.
- **Growth** — last 6 months vs. the 6 before, clamped to ±60% (`GROWTH_SCORE_CLAMP`).

Scores are comparable across the whole dataset — filtering a category renumbers ranks, not scores.

## Project structure

```
src/
  charts/        ECharts wrapper, bar and trend charts
  components/    Select, Modal, Drawer, Badge, VirtualList, feedback primitives
  constants/     ranking weights, periods, markets and cities
  dashboard/     header, KPI row, ranking table, bootstrap screen, sources dialog
  dialogs/       certification modal + Overview/Jobs/Community/Courses tabs
  filters/       dashboard filter bar
  hooks/         data bootstrap, ranking memoisation, debounce, theme
  services/      dataRepository (JSON access), crawlApi (crawl control)
  types/  utils/ shared domain types; alias matching, scoring, filtering, formatting
crawler/
  config.ts      per-source switches, limits, delays
  pipeline.ts    runs crawlers, merges records, rebuilds rankings
  dictionary/    certification dictionary
  jobs/ communities/ courses/   one module per source (a folder when it needs more than one file)
  normalize/     alias extraction, location mapping, JobPosting parsing
  aggregate/     scoring entry point
  server/        crawl API (Vite plugin + standalone server)
  util/          polite HTTP client with robots.txt handling
```

Scoring and alias logic live in `src/utils` and are imported by both app and crawler, so a score can
never differ between the two.

## Before you crawl

- Check the target's `robots.txt` **and** terms of service.
- Put a real contact address in `CRAWL_CONFIG.userAgent`.
- Keep `requestDelayMs` and `maxConcurrency` polite.
- Do not work around anti-bot protection you were not given permission to bypass.
