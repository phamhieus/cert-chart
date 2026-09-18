# IT Certification Market — Vietnam & APAC

A single-page dashboard that ranks IT certifications by **job-market demand**, **community
activity**, **holder counts where published**, and **growth**. Vietnam is the primary market
(Hanoi, Ho Chi Minh City, Da Nang); Singapore, Japan and Global/Remote are tracked alongside it for
comparison.

There is no backend database and no fabricated data: everything the dashboard shows is crawled from
public sources into JSON files under `public/data`, and every number can be traced back to the
postings, threads and course pages it came from.

```
npm install
npm run dev          # http://localhost:5173 — crawls on first visit if no data exists
```

---

## 1. How the data flow works

```
crawler/        → public/data/*.json → React dashboard
  jobs/                jobs.json        ranking table, charts, Jobs tab
  communities/         community.json   community chart, Community tab
  courses/             courses.json     Courses tab
  dictionary/          certifications.json
  aggregate/           rankings.json    pre-computed scores
                       sources.json     crawl provenance
```

The repository ships **empty** data files. On first visit the app checks whether any evidence is
stored; if not, it asks the local crawl API to run a crawl and shows live progress. Later visits
read the stored JSON directly — no crawl, no waiting.

A first crawl takes a few minutes: the sources are rate limited on purpose, and ITviec in
particular is capped (`sources.itviec.maxRequests`) so a cold start stays bounded. Raise the caps in
`crawler/config.ts` for a deeper sweep.

The crawl API is served by the Vite dev server (and by `npm run serve` for a built app):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/dataset` | record counts and the last crawl instant (ISO-8601) |
| `GET /api/crawl` | current crawl progress |
| `POST /api/crawl` | start a crawl (optional `?sources=itviec,zenn`) |

A purely static deployment (S3, GitHub Pages) has no API, so the dashboard explains that and asks
for `npm run crawl` to be run before deploying.

---

## 2. Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + crawl API |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Preview the build (crawl API included) |
| `npm run serve` | Standalone Node server for `dist/` + crawl API |
| `npm run crawl` | Crawl every enabled source, then rebuild rankings |
| `npm run crawl -- itviec zenn` | Crawl only the named sources |
| `npm run aggregate` | Rebuild `rankings.json` from the stored records |
| `npm run typecheck` | `tsc -b` across app and crawler |

Crawl results are **merged** into the existing files by record id, so running a crawl repeatedly
accumulates history instead of replacing it.

---

## 3. Sources

Every source honours `robots.txt` (parsed in `crawler/util/http.ts` per RFC 9309: `*` and `$`
wildcards, longest match wins, matched against path *and* query string), sends a descriptive
user-agent, and is rate limited by `CRAWL_CONFIG.requestDelayMs`. Toggle sources in
`crawler/config.ts`. Sources reached through an authorised API with credentials — Reddit and Udemy —
call `fetch` directly, because a key issued by the site is permission, not crawling.

| Source | Market | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| ITviec | Vietnam | Jobs | on | Detail pages publish schema.org `JobPosting` |
| TopCV | Vietnam | Jobs | needs browser | Cloudflare-gated end to end — the only crawler that drives Playwright |
| CareerViet | Vietnam | Jobs | needs browser | Result list is client-side (its API is disallowed); detail pages are fetched over plain HTTP |
| Vieclam24h | Vietnam | Jobs | on | Search is client-side and `?q=` URLs are disallowed, so postings come from the sitemap, filtered to IT occupations by slug |
| MyCareersFuture | Singapore | Jobs | on | Government portal, public search API |
| TokyoDev | Japan | Jobs | on | English-language board for roles in Japan; sitemap → job pages with schema.org `JobPosting` |
| We Work Remotely | Global | Jobs | on | Public RSS category feeds |
| Remote OK | Global | Jobs | on | Whole board as one JSON document. Its terms require a followed link back to each posting — the job rows provide it |
| Remotive | Global | Jobs | on | Public API with a search term, asked per certification |
| Arbeitnow | Europe | Jobs | on | Public API, paged; the only European source |
| LinkedIn | — | Jobs | never | `robots.txt` prohibits automated access outright and the Jobs API is partner-only. Listed so the gap is visible, never run |
| Dạy Nhau Học | Vietnam | Community | on | Discourse `latest.json` (search is disallowed) |
| Viblo | Vietnam | Community | on | Public "newest posts" RSS; coverage builds up run by run |
| Zenn | Japan | Community | on | Public article API, per topic |
| Stack Overflow | Global | Community | on | Stack Exchange API: `/search/excerpts` proves the certification is named, `/questions` supplies views and answers. `STACK_APP_KEY` only raises the quota |
| GitHub | Global | Community | on | REST search API. `GITHUB_TOKEN` raises the search limit from 10 to 30 calls/minute |
| Reddit | all | Community | needs keys | `robots.txt` forbids scraping — set `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` to use the official API |
| VOZ | Vietnam | Community | off | Behind a Cloudflare challenge; `crawler/util/browser.ts` now exists if you want to enable it |
| Official vendor training | — | Courses | on | Learning path per certification, link-checked on each run |
| Coursera | Global | Courses | on | `/api/` and `/search` are disallowed; discovery runs off the sitemaps (25,543 URLs) and reads each page's `Course` data |
| Udemy | Global | Courses | needs keys | robots.txt blocks `/api-2.0/` and every URL with a query string — set `UDEMY_CLIENT_ID` / `UDEMY_CLIENT_SECRET` for the Affiliate API |
| Vietnamese training centres | Vietnam | Courses | on | VnPro, Robusta, Athena and VTI Academy, listed by hand in `crawler/config.ts`; courses are found in link text and each page is fetched to confirm it resolves |
| Vendor certification pages | — | Holder counts | on | Certified-population figures read off the vendors' own pages — see below |

**Two sources need a real browser.** TopCV and CareerViet render behind a Cloudflare challenge that
no plain HTTP client can clear. `npm install` pulls in Playwright; `npx playwright install chromium`
downloads the browser. Both are skipped with a setup hint until then. The browser sends a Chrome
user-agent rather than the research one — it is there to pass the bot check, not a crawl ban:
`robots.txt` allows those paths and every navigation is still checked against it.

Gaps are visible rather than filled in: LinkedIn cannot be crawled at all, the large Japanese
boards refuse non-browser requests (TokyoDev covers the market instead), and Vietnamese training
centres publish "liên hệ báo giá" rather than prices, so `price` stays `null` instead of becoming a
placeholder number. The **Data sources** dialog in the header lists each source with the exact time
of its last crawl, how long that crawl took, its record count and the reason it was skipped or
failed.

### How many people hold a certification

Short answer: almost nobody publishes it per exam, and the dashboard says so rather than filling
the gap.

`crawler/holders/vendorPages.ts` reads every certification's official page and each vendor's
programme overview, and keeps any sentence stating a certified population. What comes back is
almost entirely **programme-wide**:

| Vendor | Figure | Counts | Published on |
| --- | --- | --- | --- |
| AWS | 1,050,000 | people | "…1.42 million active AWS Certifications and 1.05 million unique AWS Certified individuals" |
| EC-Council | 4,000,000 | people | "Trusted by 4 Million Certified Learners Worldwide" |
| Cisco | 4,000,000 | certifications issued | "We've issued more than 4 million certifications so far." |
| ISC2 | 270,000 | people | "Our more than 270,000 certified members, and associates…" |

Three distinctions the code refuses to blur:

- **Vendor-wide is not per-exam.** A figure is scoped to a certification only when the sentence
  carrying it names that certification. `reportedHolders()` feeds only those into the score, so AWS
  SAA never inherits every AWS-certified person. Vendor figures are shown in the certification
  dialog, labelled "programme-wide, not this exam".
- **People are not credentials.** One person holds several exams, so `counts` records whether a
  figure counts people or certificates issued. Cisco's 4 million is credentials; AWS's 1.05 million
  is people, and is preferred over the 1.42 million certifications in the same sentence.
- **A pledge is not a population.** Cisco's page says it aims to train 10 million more people over
  30 years. That is 2056, not today, and it is filtered out.

Nothing here is hand-entered: a vendor that publishes no number produces no record. Several
(Cisco's own site, PMI, Scrum.org, Oracle) block or time out on non-browser clients, so they yield
nothing at all rather than a guessed figure. Certifications without a published figure keep a null
holder score, and `weightedAverage` redistributes that 20% weight across the signals that do have
data — they are not punished for their vendor's silence.

### How far back the data goes

`CRAWL_CONFIG.historyYears` (3) is how far a source is asked to reach when its API lets us say so.
Job boards only ever publish live postings, so this really bites on the community sources, which are
where the trend lines come from:

- **Dạy Nhau Học** pages `latest.json?order=created`, walking the forum backwards by creation date.
  The default ordering is by last activity and never reaches older threads at all.
- **Zenn** pages each topic newest-first and stops once a whole page falls outside the window.
- **Stack Overflow** passes `fromdate`. Sorted by votes with no bound, the top 100 results are all a
  decade old and the recent months come back empty.
- **Reddit** searches `t=all` instead of the last year.

The trend series is 36 months wide (`TREND_MONTHS`), and the period filter offers 24 and 36 months.
`growth12m` deliberately stays a 12-month measure over the tail of that series — widening the trend
must not silently redefine what the growth column means.

### Adding a source

1. Create a module in `crawler/jobs/`, `crawler/communities/` or `crawler/courses/` exporting a
   `SourceCrawler` (`crawler/types.ts`): `id`, `name`, `url`, `type`, `isEnabled`, `run`.
2. Resolve certifications with `extractJobCertifications` / `countCertificationMentions`
   (`crawler/normalize/certifications.ts`) — never hand-roll alias matching.
3. Map places with `resolveLocation` / `marketLocation` (`crawler/normalize/location.ts`).
4. Register it in `crawler/pipeline.ts` and add its config block in `crawler/config.ts`.

---

## 4. JSON files

`certifications.json` — the curated dictionary (`crawler/dictionary/certifications.ts`). Aliases are
what crawlers match against, so `AZ104`, `AZ-104` and `Azure Administrator Associate` all resolve to
one certification.

```json
{
  "id": "az-104",
  "name": "Microsoft Certified: Azure Administrator Associate",
  "shortName": "AZ-104",
  "vendor": "Microsoft",
  "code": "AZ-104",
  "category": "Cloud",
  "level": "Associate",
  "aliases": ["AZ-104", "AZ104", "Azure Administrator", "Azure Administrator Associate"],
  "officialUrl": "https://learn.microsoft.com/credentials/certifications/azure-administrator/"
}
```

`jobs.json` — one record per posting, with the certifications it mentions and how strongly.

```json
{
  "id": "itviec_cloud-engineer-acme-1234",
  "title": "Cloud Engineer",
  "company": "Acme",
  "location": { "country": "VN", "market": "vietnam", "city": "Hanoi" },
  "certifications": [{ "id": "aws-saa", "requirement": "preferred" }],
  "source": { "name": "ITviec", "url": "https://itviec.com/it-jobs/..." },
  "postedAt": "2026-09-02",
  "crawledAt": "2026-09-18T14:03:22.101Z"
}
```

`community.json` — one record per thread/article per certification. `views`, `reactions` and
`uniqueAuthors` are `null` when the source does not publish them.

```json
{
  "id": "dnh_136314_aws-saa",
  "certificationId": "aws-saa",
  "source": { "name": "Dạy Nhau Học", "url": "https://daynhauhoc.com/t/.../136314" },
  "title": "Học AWS SAA có đáng không?",
  "location": { "country": "VN", "market": "vietnam", "scope": "national" },
  "mentions": 2,
  "comments": 14,
  "views": 977,
  "reactions": 1,
  "uniqueAuthors": 4,
  "publishedAt": "2026-05-14",
  "crawledAt": "2026-09-18T14:03:22.101Z"
}
```

**Timestamps are instants, not days.** `crawledAt`, `lastChecked` and `lastCrawledAt` are full
ISO-8601 instants in UTC, so the dashboard can show the time of day a record was fetched.
`postedAt` and `publishedAt` stay `YYYY-MM-DD` because that is all the sources publish.
Records written before this change carry a date only; the UI labels them
"no clock time recorded" instead of inventing one.

**Locations are never inferred from people.** A record carries a `city` only when the source states
one. Community threads use `scope: "national"` (covers a whole market) or `scope: "unknown"`.

`courses.json` — `type` is `official`, `training-center` or `online-platform`; `price` is `null`
when no price is published (never a placeholder number).

`rankings.json` — pre-computed metrics and scores per certification, rebuilt by `npm run aggregate`.

`sources.json` — provenance: source name, type, website, records collected, and the exact instant
the last crawl of that source started (`lastCrawlStartedAt`), finished (`lastCrawledAt`) and how
long it took (`lastCrawlDurationMs`).

---

## 5. Ranking formula

Weights live in `src/constants/ranking.ts` — the only place scoring constants are defined.

```ts
export const RANKING_WEIGHTS = { jobs: 0.35, community: 0.30, holders: 0.20, growth: 0.15 };
```

**Job demand.** A mention is weighted by how the posting treats it — `required` 1.0, `preferred`
0.6, `mentioned` 0.2 (`REQUIREMENT_WEIGHTS`), classified from the wording around the mention. The
weighted total is log-normalised against the strongest certification so one dominant vendor cannot
flatten the rest.

**Community.** 30% unique posts, 30% unique authors, 20% comments, 10% engagement
(reactions + views/100), 10% recent growth (`COMMUNITY_WEIGHTS`), each log-normalised. Raw mention
count alone is deliberately not used: a single viral thread should not decide a ranking.

**Holders.** No vendor publishes per-market holder counts. Rather than invent a number, the holder
score is only computed for certifications with a real reported figure; for the rest, the 20% weight
is redistributed across job demand, community and growth. The column shows *not published* instead
of an estimate. To supply real figures, fill `REPORTED_HOLDERS` in `crawler/aggregate/index.ts`.

**Growth.** The last 6 months of job + thread volume compared with the 6 months before, mapped onto
0–100 with ±60% as the extremes (`GROWTH_SCORE_CLAMP`). The table shows the raw percentage with
↑ / ↓ / → depending on `TREND_FLAT_THRESHOLD`.

Scores are comparable across the whole dataset, so filtering to one category does not change them —
only the rank numbers shown are renumbered for the current view.

---

## 6. Dashboard

One page, no sub-pages: evidence opens in a modal so comparison never loses its place.

- **Filters** (region → market/city, category, period, search by name/short name/exam code/vendor).
  With the defaults (all markets, all time) the table reads the pre-aggregated `rankings.json`;
  narrowing region or period recomputes scores in the browser from the filtered records.
- **Ranking table** — sortable on every numeric column. Clicking a row opens the certification;
  clicking a *number* opens it straight on the matching tab (jobs → Jobs, mentions → Community,
  courses → Courses).
- **Charts** (Apache ECharts): job demand, community interest, and a 12-month trend comparison for
  the certifications you pick. Bars are clickable and open the same evidence.
- **Certification modal** — Overview, Jobs, Community, Courses, with its **own** region and period
  filters that never touch the dashboard filters. Long lists are virtualised; inactive tabs are not
  rendered.
- **Data sources** dialog — provenance for every number, and a Refresh button that re-runs the crawl.

---

## 7. Project structure

```
src/
  charts/        ECharts wrapper, bar and trend charts
  components/    Select, Modal, Badge, VirtualList, feedback primitives
  constants/     ranking weights, periods, markets and cities
  dashboard/     header, KPI row, ranking table, bootstrap screen, sources dialog
  dialogs/       certification modal + Overview/Jobs/Community/Courses tabs
  filters/       dashboard filter bar
  hooks/         data bootstrap, ranking memoisation, debounce, theme
  services/      dataRepository (JSON access), crawlApi (crawl control)
  types/         shared domain types
  utils/         alias matching, scoring, filtering, formatting, region logic
crawler/
  config.ts      per-source switches, limits, delays
  pipeline.ts    runs crawlers, merges records, rebuilds rankings
  dictionary/    certification dictionary
  jobs/ communities/ courses/   one module per source
  normalize/     alias extraction, location mapping, JobPosting parsing
  aggregate/     scoring entry point
  server/        crawl API (Vite plugin + standalone server)
  util/          polite HTTP client with robots.txt handling
```

Scoring and alias logic live in `src/utils` and are imported by both the app and the crawler, so a
score can never differ between the two.

---

## 8. Before you crawl

- Check the target's `robots.txt` **and** terms of service; some sites forbid automated access even
  when their markup is easy to parse.
- Put a real contact address in `CRAWL_CONFIG.userAgent`.
- Keep `requestDelayMs` and `maxConcurrency` polite; raising them is how a research crawler turns
  into a nuisance.
- Do not work around anti-bot protection you were not given permission to bypass.
#   c e r t - c h a r t  
 