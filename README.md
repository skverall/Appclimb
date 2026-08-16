# AppClimb — App Store keyword explorer

AppClimb is a **freemium App Store keyword tool**. The lead feature is official
Apple Ads popularity — not a competitor model with no source.

Search any keyword and get Apple's official Ads score (`searchPopularity1to100`,
1–100) when the term is in that storefront and genre; otherwise a labeled
iTunes estimate. Difficulty and evidence still come from the public iTunes
Search API. Everything works without an account, on honest daily limits
(8 keyword checks, 5 assistant messages, 1 tracked app); the optional Pro plan
($8/month, $64/year) lifts the limits and adds cloud sync.

> Popularity is either Apple Ads official (relative 1–100) or an estimate
> from public signals. Difficulty is always an estimate. Neither is search
> volume. Both are labeled in the UI. Competitors that sell unexplained
> “search volume” are the thing we refuse to copy.

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
- **Storefronts** — 16 supported countries.
- **Local history** — Keyword Explorer: one daily snapshot per keyword per
  country in `appclimb:kw:v1:*` (first check seeds an estimated baseline with
  `backfilled: true`). My Apps: real position/metrics snapshots in
  `appclimb:tracker:v1` (rank history is never backfilled).
- **Accounts & Pro (ADR 0004)** — optional sign-in (Google OAuth or email
  magic link), Paddle billing, plan-aware quotas, and Pro cloud sync. Off by
  default behind `NEXT_PUBLIC_PRO_ENABLED`.
- **Marketing pages** — `/app-store-keywords`, `/guides/keyword-research`,
  `/blog` (+ 4 notes), `/about`, `/pricing`, `/privacy`, `/terms`, `/refunds`.

## Architecture

A single Next.js app deployed as a Cloudflare Worker (OpenNext). The browser
queries `itunes.apple.com` directly (Apple allows CORS `*` but blocks
Cloudflare Worker IPs). Official popularity is one server hop:
`POST /api/popularity` calls Apple Ads Platform API v1 with founder
credentials. Keyword history lives in the visitor's browser by default.

Monetization runs on the same Worker plus a **D1 database** (`appclimb-db`,
staging `appclimb-db-staging`):

- `src/app/api/auth/*` — magic-link + Google sign-in, sign-out
- `src/app/api/me` — profile, plan, limits
- `src/app/api/sync` — Pro cloud sync (`tracker` / `explorer` blobs, LWW)
- `src/app/api/billing/webhook` — signed Paddle events → D1 subscriptions
- `src/app/api/billing/portal` — Paddle subscription management URLs
- `src/app/api/chat`, `src/app/api/popularity` — plan-aware quotas
- `migrations/` — D1 schema; `src/lib` — plan/auth/billing/sync/quota libs
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

## Monetization setup (accounts · Paddle · sync)

The backend ships inert: routes degrade to 503 and the account UI is hidden
until the founder completes this checklist. Do it in **sandbox first**, then
repeat for production.

1. **Databases** — already created: `appclimb-db` (production) and
   `appclimb-db-staging`. Local dev: `npx wrangler d1 migrations apply appclimb-db --local`.
2. **Paddle** — create an account at paddle.com, then under Products create
   “AppClimb Pro” with two prices: **Pro Monthly $8** and **Pro Yearly $64**.
   Note their price IDs. In Sandbox → Developer tools → Authentication grab the
   **API key**, **client-side token**, and a **notification/webhook secret**.
3. **Webhook** — in Paddle, subscribe to subscription events
   (`subscription.created/updated/paused/canceled`) pointing at
   `https://appclimb.app/api/billing/webhook`.
4. **Google OAuth** — Google Cloud Console → APIs & Services → Credentials →
   OAuth client (Web) with authorized redirect URI
   `https://appclimb.app/api/auth/google/callback`.
5. **Resend** — resend.com → API key, verify `appclimb.app` as a sending
   domain (add the DNS records it shows).
6. **Server secrets** (Worker, never committed):
   ```bash
   npx wrangler secret put PADDLE_API_KEY
   npx wrangler secret put PADDLE_WEBHOOK_SECRET
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put PRO_ENABLED   # value: 1  — enables plan quotas
   ```
7. **Public build-time vars** — GitHub → repo Settings → Secrets and
   variables → Actions → **Variables**:
   `NEXT_PUBLIC_PRO_ENABLED=1`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=<client token>`,
   `NEXT_PUBLIC_PADDLE_ENV=sandbox` (then `production`),
   `NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY=<price id>`,
   `NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY=<price id>`.
8. **Staging** — deploy with `npm run deploy:cloudflare:web:staging` and set
   the same secrets for the `staging` environment
   (`npx wrangler secret put ... --env staging`) before the production flip.

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
applies D1 migrations, deploys the web Worker, verifies the canonical homepage,
waits for the sitemap, and notifies IndexNow. Deploys go live immediately — run
`npm run check` and `npm run test:e2e` before pushing.

The canonical production host is `https://appclimb.app`; the staging Worker is
`appclimb-web-staging`.
