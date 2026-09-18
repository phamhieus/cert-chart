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

## Sources

Toggle sources in `crawler/config.ts`. Every source honours `robots.txt` (RFC 9309 parser in
`crawler/util/http.ts`), sends a descriptive user-agent and is rate limited by
`CRAWL_CONFIG.requestDelayMs`.

- **Jobs** — ITviec, Vieclam24h (VN) · MyCareersFuture (SG) · TokyoDev (JP) · We Work Remotely,
  Remote OK, Remotive, Arbeitnow (global/EU).
- **Community** — Dạy Nhau Học, Viblo (VN) · Zenn (JP) · Stack Overflow, GitHub (global).
- **Courses** — official vendor training, Coursera, Vietnamese training centres (VnPro, Robusta,
  Athena, VTI Academy).
- **Holder counts** — vendor certification pages.

Needs setup: **TopCV** and **CareerViet** are Cloudflare-gated and drive Playwright
(`npx playwright install chromium`). **Reddit** and **Udemy** need API credentials
(`REDDIT_CLIENT_ID`/`SECRET`, `UDEMY_CLIENT_ID`/`SECRET`). **VOZ** is off by default. **LinkedIn**
is never crawled — its `robots.txt` prohibits it outright.

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
  `AZ104`, `AZ-104` and `Azure Administrator Associate` resolve to one certification.
- **Timestamps are instants.** `crawledAt`, `lastChecked`, `lastCrawledAt` are ISO-8601 UTC
  instants; `postedAt` / `publishedAt` stay `YYYY-MM-DD` because that is all sources publish.
- **Locations are never inferred from people.** A record carries a `city` only when the source
  states one; community threads use `scope: "national"` or `"unknown"`.
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
