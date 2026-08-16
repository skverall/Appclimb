# AppClimb — Free App Store keyword explorer

AppClimb is a **free App Store keyword tool**: search any keyword and get a
popularity score (0–100), an estimated difficulty score (0–100), and a 30-day
trend chart. Difficulty and evidence come from Apple's public iTunes Search
API. Popularity is Apple Ads official (`searchPopularity1to100`) when the
founder-owned Platform API v1 lookup hits; otherwise the iTunes estimate.
No visitor account and no tracking.

> Popularity is either Apple Ads official (relative 1–100) or an estimate
> from public signals. Difficulty is always an estimate. Neither is search
> volume. Both are labeled in the UI.

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

A single Next.js app deployed as a Cloudflare Worker (OpenNext). The browser
queries `itunes.apple.com` directly (Apple allows CORS `*` but blocks
Cloudflare Worker IPs). Official popularity is the only server hop besides
the optional assistant: `POST /api/popularity` calls Apple Ads Platform API
v1 with founder credentials. Keyword history never leaves the visitor's
browser.

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

Keyword Explorer / My Apps work without env vars (iTunes estimate fallback).

Official Apple Ads popularity needs **server-only** founder credentials:

```bash
# local — see .env.example
APPLE_ADS_CLIENT_ID=...
APPLE_ADS_TEAM_ID=...
APPLE_ADS_KEY_ID=...
APPLE_ADS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APPLE_ADS_ACCOUNT_ID=...

# production Worker secrets (never commit)
npx wrangler secret put APPLE_ADS_CLIENT_ID
npx wrangler secret put APPLE_ADS_TEAM_ID
npx wrangler secret put APPLE_ADS_KEY_ID
npx wrangler secret put APPLE_ADS_PRIVATE_KEY
npx wrangler secret put APPLE_ADS_ACCOUNT_ID
```

Optional **ASO Assistant** (DeepSeek V4 Flash) needs a **server-only** key:

```bash
# local
echo 'DEEPSEEK_API_KEY=sk-...' >> .env.local

# production Worker secret (never commit the key)
npx wrangler secret put DEEPSEEK_API_KEY
```

The key is used only by `POST /api/chat`. It is never shipped to the browser.

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
and notifies IndexNow. Deploys go live immediately — run `npm run check` and
`npm run test:e2e` before pushing.

The canonical production host is `https://appclimb.app`; the staging Worker is
`appclimb-web-staging`.
