# AppClimb — Free App Store keyword explorer

AppClimb is a **free App Store keyword tool**: search any keyword and get an
estimated popularity score (0–100), an estimated difficulty score (0–100), and
a 30-day trend chart — built entirely from Apple's public iTunes Search API,
with no account and no tracking.

> Popularity and difficulty are estimates derived from public signals
> (competition pressure and top-result strength). They are always labeled as
> estimates and never presented as Apple Search Ads volume, which is not
> publicly available.

The canonical product north star lives in
[PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md). Read it before changing product
direction or expanding the feature set.

## Product surface

- **Keyword Explorer** (`/`) — zero-setup search with live suggestions, a
  keyword table with estimated Popularity / Difficulty bars and Trend
  sparklines, and a detail panel with 30-day charts, related keywords, and the
  top 10 apps for the term. No app setup required.
- **My Apps tracker** (`/`, sidebar) — add an iOS app by name, App Store URL, or
  ID; get metadata-based keyword suggestions; track estimated scores, observed
  position in public iTunes results (first 200), notes, opportunity heuristic,
  status filters, CSV export, and real rank history locally per app + storefront.
- **Storefronts** — US, GB, DE, FR, RU, JP.
- **Local history** — Keyword Explorer: one daily snapshot per keyword per
  country in `appclimb:kw:v1:*` (first check seeds an estimated baseline with
  `backfilled: true`). My Apps: real position/metrics snapshots in
  `appclimb:tracker:v1` (rank history is never backfilled).
- **Marketing pages** — `/app-store-keywords`, `/guides/keyword-research`,
  `/blog` (+ 4 notes), `/about`, `/pricing` (free), `/privacy`, `/terms`,
  `/refunds`.

## Architecture

A single Next.js app deployed as a Cloudflare Worker (OpenNext). There is **no
backend API**: the tool queries `itunes.apple.com` directly from the browser
(Apple allows CORS `*` but blocks Cloudflare Worker IPs), and keyword history
never leaves the visitor's browser.

- `src/app` — pages, layout, sitemap/robots/feed/manifest
- `src/components` — `app-workspace`, `tracker-view`, `keyword-explorer`,
  `keyword-detail`, `keyword-charts`, marketing shell + layout components
- `src/lib/aso.ts` — estimation heuristics, explorer history, related keywords
- `src/lib/itunes.ts` — public iTunes Search API helpers + keyword suggestions
- `src/lib/tracker.ts` — My Apps localStorage schema, position, rank trends
- `src/lib/site.ts` — public discovery inventory (sitemap/feed metadata)
- `wrangler.jsonc` — the `appclimb-web` Worker (assets only)
- `worker/`, `deploy/`, `compose.yml` — frozen rollback artifacts from earlier
  architectures; never the current backend

## Local development

```bash
npm install
npm run dev
```

No environment variables are required. No accounts, keys, or databases.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run build:cloudflare
npm run test:e2e
```

`npm run check` runs lint, typecheck, coverage, and both builds.

## Production configuration

Pushes to `main` run `.github/workflows/cloudflare-deploy.yml`, which builds,
deploys the web Worker, verifies the canonical homepage, waits for the sitemap,
and notifies IndexNow. **Do not push or deploy without explicit founder
approval.**

The canonical production host is `https://appclimb.app`; the staging Worker is
`appclimb-web-staging`.
