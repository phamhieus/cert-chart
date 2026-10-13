# IT Certification Market — Vietnam & APAC

A single-page dashboard ranking IT certifications by **job demand**, **community activity**,
**published holder counts** and **growth**. Vietnam is the primary market (Hanoi, HCMC, Da Nang);
Singapore, Japan, Global and Remote are tracked for comparison. **Global** is a real, specific
place outside those markets (a Greenhouse posting in "San Francisco, CA") or content with no
location at all (a GitHub repo, an online course); **Remote** is a posting whose source explicitly
says the work is location-independent ("Remote", "Anywhere", "Worldwide") — the two used to be one
bucket, which undercounted actually-remote postings once employer-ATS boards with real office
addresses (Greenhouse) started flowing in alongside remote-only job boards.

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
                       roles.json      (postings per role, no certification needed)
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

## Sources

Toggle sources in `crawler/config.ts`. Every source honours `robots.txt` (RFC 9309 parser in
`crawler/util/http.ts`), sends a descriptive user-agent and is rate limited by
`CRAWL_CONFIG.requestDelayMs`.

- **Jobs** — ITviec, Vieclam24h (VN) · MyCareersFuture (SG) · TokyoDev (JP) · We Work Remotely,
  Remote OK, Remotive, Arbeitnow, Himalayas (global/remote) · Greenhouse (a hand-picked list of
  mostly US employers on the Greenhouse ATS — see `crawler/config.ts`; this widens the global
  bucket, not Vietnam).
- **Community** — VOZ, Quản Trị Mạng, Dạy Nhau Học, Viblo (VN) · Zenn (JP) · Stack Exchange
  (stackoverflow.com, serverfault.com, security.stackexchange.com, pm.stackexchange.com), GitHub,
  dev.to, Medium (global).
- **Courses** — official vendor training, Coursera, Vietnamese training centres (VnPro, Robusta,
  Athena, VTI Academy).
- **Holder counts** — vendor certification pages.

Needs setup: **TopCV** and **CareerViet** are Cloudflare-gated and drive Playwright
(`npx playwright install chromium`).

Needs a resolver: **Medium** is read through its documented per-tag RSS feeds
(`medium.com/feed/tag/{tag}`), which need no key — but several Vietnamese ISPs DNS-block
medium.com and answer with `127.0.0.1`, so from a Vietnamese connection every tag fails to
connect and the source reports the block instead of returning 0 records quietly. A public
resolver (1.1.1.1, 8.8.8.8) is the fix; nothing in the crawler changes.

Three things about Medium were measured rather than assumed, and all three shape
`crawler/config.ts`:

- **A tag feed is the 10 newest stories and does not paginate**, so a tag is a ten-story budget
  per run, not a starting point to page through — the reverse of dev.to, where `pagesPerTag`
  makes a broad tag pay off. Spend it on certification-shaped tags: `ccna`, `cissp`, `cka`,
  `comptia-security-plus` and `pmp-certification` each measured **10/10** stories naming a
  tracked certification, while `certification`, `kubernetes`, `terraform`, `cybersecurity`,
  `cloud-computing` and `devops` measured **0/10** each and were dropped. Every per-tag number
  is recorded in `crawler/config.ts`, and each run logs its own yield by tag, so a tag that
  stops paying is visible rather than inferred.
- **A tag feed carries no story body.** `content:encoded` is empty on every item (it is
  populated on profile feeds, not these) and `description` is a 90–180 character teaser ending
  in "Continue reading on Medium", so a story is matched on its title, that teaser and its own
  tags — the dev.to shape, not the VOZ one. A certification named only deep in the body is
  missed; reading bodies would cost a request per story instead of one per ten.
- **Medium rate limits by IP, harder than the global 900ms delay covers.** A fifteen-tag run
  paced only by `crawler/util/http.ts` lost nine tags to 429 and the escalating retry there did
  not win them back, so Medium carries its own `requestDelayMs` (4s, waited between tags) and
  the list is held to eleven tags. The penalty outlasts a single run, so a throttled run clears
  on its own; a tag that is throttled is logged and skipped rather than failing the run, and the
  next run picks its stories up — the feed is the ten newest either way. Coverage therefore
  accumulates run by run, like VOZ and Viblo.

Left out for the same reason the broad tags were: `oracle-certification` (0/8),
`ethical-hacking` (0/10), `google-cloud-certification` (no such tag), `java-certification`
(1/9, and the one hit was an alias collision rather than an Oracle story), and
`gcp-certification` (1/10, dropped to stay under the rate limit — GCP ACE has no Medium
coverage as a result). `ccnp`, `az-104`, `scrum-certification` and
`aws-certified-solutions-architect` are **untested**: Medium began answering 429 before the
probe reached them.

Four sources read a credential. Copy `.env.example` to `.env` (git-ignored) and fill in what you
have — `crawler/env.ts` loads it for `npm run crawl`, `npm run serve` and the dev server's crawl
API alike. Every key is optional, and a source without its key reports itself as skipped rather
than being scraped as a fallback.

| Variable | Source | Without it | Where to get it |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | GitHub | 10 search requests/minute, so the crawl takes ~7 minutes and terms start failing with 403 | [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) — no scopes needed |
| `STACK_APP_KEY` | Stack Exchange | 300 requests/day, and one run across the four sites already uses most of it | [stackapps.com/apps/oauth/register](https://stackapps.com/apps/oauth/register) — use the "key", not the secret |
| `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Reddit | nothing at all; `robots.txt` forbids scraping, so the API is the only route | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) — create a "script" app |
| `UDEMY_CLIENT_ID` + `UDEMY_CLIENT_SECRET` | Udemy | nothing at all; `robots.txt` disallows the API and every query-string URL | [udemy.com/developers/affiliate](https://www.udemy.com/developers/affiliate/) — needs affiliate approval first | **LinkedIn** is never
crawled — its `robots.txt` prohibits it outright. **Remotive** stays enabled but has been
returning 0 records: its `robots.txt` disallows both `/api/*` and `/*search=`, which the crawler's
own search calls hit, so every run is correctly blocked rather than silently degraded — kept
enabled rather than removed in case Remotive relaxes its `robots.txt`.

**Vietnamese community coverage is thin, and it is thin for a measurable reason.** VOZ's
`lap-trinh-cntt` and `tuyen-dung-tim-viec` forums are the only place Vietnamese IT people discuss
certifications in volume, and VOZ serves its HTML behind a Cloudflare challenge — so it is read
through `/f/{forum}/index.rss`, which is not challenged and carries the opening post. The rest was
measured rather than assumed: Dạy Nhau Học has **1** certification thread in 1,200 topics spanning
its full three-year window (and 0 in a 60-topic sample of full post bodies and replies), Viblo's
only permitted endpoint is a 40-item feed covering roughly 36 hours, and Tinh tế returned **0** in
25 threads read with their comments. Those are real findings about the communities, not crawler
faults, and no amount of extra crawling changes them.

Considered and left out, so the reasoning doesn't get re-litigated:

| Source | Why not |
| --- | --- |
| VietnamWorks | `robots.txt` allows `?q=` search and `__NEXT_DATA__` carries a real `jobCounts`, but the actual postings load client-side through Algolia — `searchResultData` on the server-rendered page is just `{nbHits}`, no per-posting url/company/date to store. |
| TopDev | `robots.txt` allows it, but `?keyword=` 301s to a client-rendered `/jobs/search` that drops the query — would need its internal search API reverse-engineered. |
| Credly | The one place a real per-certification holder count lives (`credly.com/org/{vendor}/badge/{cert}`), which would fix the "almost everything is vendor-wide" gap noted below — but it drops plain HTTP clients after the first request. Would need Playwright, the same path TopCV/CareerViet already take. |
| Lever, Ashby | Same API shape as Greenhouse and just as easy to add, but the boards tried (Palantir, Spotify, Ramp, Deel) had zero postings naming a tracked certification — mostly product/software-startup boards, not the infra/security postings that do. |
| SmartRecruiters | `robots.txt` is `Disallow: /` for everyone except `LinkedInBot`. |
| Qiita | Would pair well with Zenn for the Japan market, but `robots.txt` disallows `/api/*`. |
| Tinh tế | Vietnam's largest consumer-tech forum, fully crawlable (per-forum RSS, thread pages render server-side). 25 threads read **including their comments** named a tracked certification **0** times — the forums are phones, PCs and gaming, not IT-professional. |
| VietJack | Not a community: a K-12 homework and basic-programming tutorial site (its own links are grade-1 maths and teacher materials). Its Java/Python/SQL tutorials mention **no** tracked certification. |
| whitehat.vn | The right kind of source — Vietnam's security community, where CEH/CISSP would come up — but the site answers 503 "Hệ thống đang nâng cấp". Worth revisiting when it returns. |
| Wikimedia pageviews | Runs fine and gives a real per-article monthly view count (a candidate `growth` signal), but only ~4 of the tracked certifications have their own Wikipedia article — most of `AZ-104`, `CKA`, `DP-203`, etc. would sit at `null`. Not wired in as a scored source; revisit only as an unweighted, nullable signal. |

Gaps stay visible rather than filled in: unpublished prices stay `null`, unpublished holder counts
stay absent, and the **Data sources** dialog shows each source's last crawl time, duration, record
count and skip/failure reason.

**Holder counts are programme-wide, not per-exam.** `crawler/holders/vendorPages.ts` keeps a figure
only when the sentence carrying it names the certification, records whether it counts people or
credentials issued, and filters out pledges (Cisco's "10 million over 30 years"). A certification
with no published figure gets a null holder score, and its 20% weight is redistributed.

**History** — `CRAWL_CONFIG.historyYears` (3) bounds how far community sources reach; job boards
only publish live postings. Trend series are 36 months (`TREND_MONTHS`), while `growth12m` stays a
12-month measure.

### Adding a source

1. Export a `SourceCrawler` (`crawler/types.ts`) from `crawler/jobs|communities|courses/`.
2. Resolve certifications with `extractJobCertifications` / `countCertificationMentions`
   (`crawler/normalize/certifications.ts`) — never hand-roll alias matching.
3. Map places with `resolveLocation` / `marketLocation` (`crawler/normalize/location.ts`).
4. Register it in `crawler/pipeline.ts` and add its config block in `crawler/config.ts`.

## Data conventions

- `certifications.json` is the curated dictionary — aliases are what crawlers match against, so
  `AZ104`, `AZ-104` and `Azure Administrator Associate` resolve to one certification. It is the
  one place a certification is registered: every source matches against it, so adding an entry
  widens all of them at once and needs no per-source change. **34 certifications across 12
  categories**, including QA (ISTQB), Business Analysis (IIBA, PMI) and DevOps (Microsoft,
  Google Cloud, Red Hat, HashiCorp).
- **Aliases are written to avoid job titles.** `Test Automation Engineer` and `Business Analyst`
  are roles, not certifications, so neither is an alias — matching them would count every QA and
  BA posting as a certification mention. Bare `ISTQB` is the one deliberate exception: a posting
  that asks for "chứng chỉ ISTQB" with no level means the foundation exam, and the longer
  Advanced aliases are matched and masked first so `ISTQB Advanced Test Management` is not also
  counted as CTFL. `crawler/dictionary/certifications.ts` records the reasoning per entry.
- **Timestamps are instants.** `crawledAt`, `lastChecked`, `lastCrawledAt` are ISO-8601 UTC
  instants; `postedAt` / `publishedAt` stay `YYYY-MM-DD` because that is all sources publish.
- **Locations are never inferred from people.** A record carries a `city` only when the source
  states one; community threads use `scope: "national"` or `"unknown"`.
- **Nulls are not zeroes.** `views`, `reactions`, `uniqueAuthors` and `price` are `null` when
  unpublished — never a placeholder number.

**The four business-analysis certifications score zero, and the role-demand counts say why.**
ECBA, CCBA, CBAP and PMI-PBA return nothing from any source, and the obvious reading — "nobody
hires BAs" — is wrong. On ITviec, **10 of 276 postings (3.6%) are Business Analyst roles, and 0 of
those 10 name any certification at all.** BA hiring in Vietnam is real; asking for a BA
certification is not a thing employers here do. Compare QA on the same board: 27 postings (9.8%),
of which 7 (26%) do name one, which is why ISTQB CTFL scores and CBAP does not.

This is the distinction the role counts exist to make, and it is why they are worth having:
without them a zero on CBAP is indistinguishable from a zero on a role nobody is hiring. Read it
as "absent from this snapshot" rather than "never appears" — job boards publish only live postings
and every source is capped. The entries stay in the dictionary so the gap stays visible and the
first posting that does name CBAP is counted the day it appears.

## Role demand

Certification records answer "which exams does the market ask for". They cannot answer "how much
QA hiring is there", and the reason is structural: **every job crawler drops a posting that names
no certification** (`if (certifications.length === 0)`). Measuring QA demand from `jobs.json`
would only ever measure QA-demand-that-happens-to-mention-a-certification, which for QA is a small
and unrepresentative slice.

So roles are counted separately, in `roles.json`, as the crawlers walk their listings:

| Role | Counted from titles like |
| --- | --- |
| `qa` | QA, QC, Tester, Test Engineer, Quality Assurance, SDET, kiểm thử |
| `ba` | Business Analyst, Business Analysis, phân tích nghiệp vụ |
| `devops` | DevOps, SRE, Site Reliability, Platform Engineer, kỹ sư hệ thống |

QA, QC and Tester are **one role**, not three — they are the three names Vietnamese postings use
for the same job, so splitting them would split one market across three rows.

Four rules keep the numbers honest:

- **Titles only.** A description routinely says "work closely with the QA team" in a posting
  hiring a backend developer; the body is evidence of collaboration, not of the role being hired.
- **Only boards whose full listing is enumerated** — ITviec, Vieclam24h, TokyoDev, Greenhouse, We
  Work Remotely, Remote OK, Arbeitnow, Himalayas. TopCV, CareerViet and MyCareersFuture search
  **per certification**, so their postings are pre-filtered by certification and a role share taken
  from them would describe the query, not the market.
- **A denominator travels with every count.** Each record carries `scanned`, the total postings in
  its (source, market, month) bucket, so "13 QA postings" is never read without "of 4,677".
  `scanned` is repeated on all three role rows of a bucket, so sum it for one role, not across
  roles.
- **No bare `BA` alias.** Matching is diacritic-stripped and lowercased, and "ba" is an ordinary
  Vietnamese word (*three*, *father*), so a bare `BA` would match a large share of Vietnamese
  titles that have nothing to do with the role.

A bucket is replaced, not accumulated, when the same month is re-crawled: the figure is "what the
board showed for this month", not a running total of sightings. A partial crawl therefore lowers a
bucket rather than corrupting it.

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
  components/    Select, Modal, Badge, VirtualList, feedback primitives
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
  jobs/ communities/ courses/   one module per source
  normalize/     alias extraction, role detection, location mapping, JobPosting parsing
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
