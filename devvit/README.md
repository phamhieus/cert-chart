# cert-chart

A Reddit [Devvit](https://developers.reddit.com) app that counts IT certification
mentions in the subreddit it is installed in, and renders the result as an
interactive post.

Built on Devvit Web (`devvit.json` + `@devvit/web` 0.14.5, Hono server, Node 24).
No Reddit OAuth credentials, no scraping — all Reddit access goes through the
first-party `reddit` client, which Devvit authenticates for you.

## What it tracks

Twelve credentials, aliased to one canonical name each
(`src/shared/certifications.ts`):

| Canonical name | Matches, among others |
| --- | --- |
| AWS Certified Solutions Architect – Associate | `SAA`, `SAA-C03`, `AWS SAA` |
| AWS Certified Developer – Associate | `DVA`, `DVA-C02`, `AWS DVA` |
| AWS Certified Solutions Architect – Professional | `SAP-C02`, `AWS SAP` |
| Microsoft Certified: Azure Fundamentals (AZ-900) | `AZ-900`, `az 900`, `az900` |
| Microsoft Certified: Azure Administrator Associate (AZ-104) | `AZ-104`, `azure administrator associate` |
| Google Cloud Associate Cloud Engineer | `GCP ACE`, `associate cloud engineer` |
| Google Cloud Professional Cloud Architect | `professional cloud architect`, `GCP PCA` |
| Certified Kubernetes Administrator (CKA) | `CKA` |
| Certified Kubernetes Application Developer (CKAD) | `CKAD` |
| ISTQB Certified Tester Foundation Level (CTFL) | `ISTQB`, `CTFL` |
| Cisco Certified Network Associate (CCNA) | `CCNA`, `200-301` |
| CompTIA Security+ | `Security+`, `sec+`, `SY0-701` |

**A mention is one post or one comment that names a certification at least
once**, so `total = posts + comments` and a rant that says "CKA" nine times
still counts once.

Three acronyms are deliberately *not* matched on their own, because precision
matters more than recall here: **SAP** (the ERP vendor), **ACE** (an English
word) and **PCA**. They are only counted with a qualifier — `SAP-C02`,
`AWS SAP`, `GCP ACE`, `associate cloud engineer`, and so on.

## How it works

```
src/
  shared/certifications.ts   catalogue: canonical names + aliases
  shared/api.ts              response types shared by client and server
  server/core/parser.ts      alias normalisation and matching
  server/core/store.ts       Redis layer (all keys live here)
  server/core/ingest.ts      claim-then-count, idempotent
  server/core/scan.ts        Reddit data access: hourly catch-up + backfill
  server/core/aggregate.ts   totals, 7d / 30d windows, trend
  server/routes/             /api, /internal/menu, /internal/triggers, /internal/scheduler
  client/                    the dashboard (plain TS, no framework)
```

**Ingest paths**, all funnelling through the same idempotent `ingestItem`:

1. `onPostCreate` / `onCommentCreate` triggers — real time, the primary path.
2. `incremental-sync` scheduled task (hourly) — re-checks the newest 50 posts
   and their comments, because trigger delivery is best-effort.
3. `deep-backfill` scheduled task — walks the subreddit's historical listing in
   batches of 25 posts, re-scheduling itself until it runs out. Queued on
   install, or manually from the subreddit menu.

Devvit warns that triggers may deliver more than once, so every write path first
claims the Reddit thing id with an atomic `hSetNX`. Re-running the backfill is
therefore safe and never double counts.

**Redis layout** (Devvit namespaces Redis per app installation, so these keys
are already scoped to one subreddit):

| Key | Type | Contents |
| --- | --- | --- |
| `stats:totals` | hash | `<certId>:post` / `<certId>:comment` → count |
| `stats:daily:<certId>` | hash | `YYYY-MM-DD` → count |
| `seen:post`, `seen:comment` | hash | claimed thing ids (idempotency) |
| `meta` | hash | backfill cursor, last sync time |

`last7` and `last30` are sums over the daily buckets; **trend** is the percent
change of the last 7 days against the 7 before that. No baseline (an empty
previous window) renders as `new` rather than a fake percentage. A nightly
`prune-history` task drops buckets older than 400 days.

## Known limits

These are platform limits, not implementation shortcuts:

- **History is capped.** Reddit's subreddit listings stop at roughly 1000 posts,
  so the backfill cannot reach further back than that, however long the
  subreddit has existed. Counts are "from install, plus as much history as
  Reddit will serve".
- **No subreddit-wide comment listing.** `reddit.getComments()` requires a
  `postId`, so historical comments are only reachable post by post, capped at
  `COMMENTS_PER_POST_LIMIT` (100) per post. Comments on old, busy threads that
  were never triggered can be missed.
- **One subreddit per installation.** Devvit's Redis and Reddit access are
  scoped to the install. Cross-subreddit totals would need a separate
  aggregation service.
- **Only public content**, and only what the app account can see. Removed,
  deleted and spam-flagged items are skipped.
- **Edits are not re-counted.** A comment edited later to add a certification
  keeps its original count (`onCommentUpdate` could be wired up if that matters).

## Local development

Requires Node 24+ and a Reddit account [registered as a
developer](https://developers.reddit.com).

```bash
cd devvit
npm install
npm run login          # devvit login, once per machine
```

Point `dev.subreddit` in `devvit.json` at a test subreddit you moderate, then:

```bash
npm run dev            # devvit playtest — uploads on every save
```

`playtest` prints a URL like `https://www.reddit.com/r/<your-sub>/?playtest=cert-chart`.
Installing the app creates the dashboard post and queues the backfill; the
subreddit's mod menu also has **cert-chart: create dashboard post** and
**cert-chart: rescan subreddit history**.

Other commands:

```bash
npm run build          # vite build -> dist/client + dist/server
npm run type-check     # tsc --noEmit
npm run test           # vitest run (parser precision suite)
```

Server logs from triggers and scheduled tasks stream into the playtest terminal.

## Deployment

```bash
npm run deploy         # type-check + tests + devvit upload
npm run launch         # deploy, then devvit publish for review
```

`devvit upload` puts a new private version in your developer account, which you
can install on subreddits you moderate. `devvit publish` submits it for Reddit's
app review; approval is required before other moderators can install it.

Before publishing, add an app icon and point `marketingAssets.icon` in
`devvit.json` at it — Reddit's review expects one.

## Adding a certification

Add an entry to `CERTIFICATIONS` in `src/shared/certifications.ts` and a case to
`src/server/core/parser.test.ts`. Hyphen variants are generated automatically,
so `az-900` also matches `az 900` and `az900`. Existing content is only
re-counted when the backfill is re-run from the mod menu, and only for items
that had no match before.
