# AppClimb Web — Visual Growth OS

AppClimb is a visual growth diagnosis workspace for independent iOS
subscription apps.

> See where your app stops growing — and what to fix next.

The primary product loop is **Observe → Diagnose → Experiment → Learn**. The
demo workspace is available at `/`; AppClimb authentication starts at `/login`.

The canonical product north star, roadmap, visual principles, and instructions
for future contributors live in [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md).
Read it before changing product direction or expanding the feature set.

## Product surface

- Growth River: Discover → Store → Install → Activate → Paywall → Trial → Paid
  → Renew.
- Acquisition Atlas: channel/referrer/UTM → visitor → engagement → explicit
  conversion, with AI crawler requests kept in a separate current.
- Evidence inspector with at most three ranked opportunities.
- Growth Replay for releases, metadata, screenshots, price and paywall changes.
- Retention heatmap and Voice of Customer clusters.
- Read-only Lab proposals and integration health.
- 14-day no-card entitlement followed by `$12.99/month` or `$129/year`.
- One-page Paddle overlay checkout with a signed webhook as the entitlement
  source of truth.

The current public workspace is an interactive product demo. Growth River data
is primarily synthetic. Acquisition Atlas collection is live for AppClimb's
own `appclimb.app` property. Its data was migrated to Cloudflare D1 and the
Cloudflare collector accepted a new categorized crawler event on 2026-07-26.
The public Atlas remains labeled demo data, while authenticated workspaces show
their own collected data after completing the live workspace gate. See
[docs/acquisition-atlas.md](./docs/acquisition-atlas.md).

## Documentation map

- [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md) — canonical audience,
  product truth, roadmap, invariants, and current delivery order.
- [docs/acquisition-atlas.md](./docs/acquisition-atlas.md) — collection model,
  privacy boundary, install contract, rollout gates, and status.
- [ops/README.md](./ops/README.md) — production topology, backend release, smoke
  checks, backup, and rollback.
- [marketing/organic-growth/README.md](./marketing/organic-growth/README.md) —
  accurate public positioning and organic-discovery system.
- [public/pricing.md](./public/pricing.md) — machine-readable pricing and
  product-status contract.

## Architecture

- `src/app` — Next.js 16 App Router, route handlers and legal/auth pages.
- `src/components` — code-native River Atlas UI.
- `src/lib` — browser-safe contracts, request validation, UI data adapters and
  a server-only API session client.
- `public/appclimb-analytics.js` — small first-party browser collector;
  `src/middleware.ts` forwards recognized crawler requests separately.
- `cloudflare/api` — Hono API Worker, D1 migrations, envelope encryption,
  connector aggregates, Queue consumers, reconciliation, retries, UTC windows,
  billing, password recovery, and 90-day analytics retention.
- `wrangler.jsonc` — OpenNext web Worker, static assets, observability, and the
  private API service binding.
- `worker`, `compose.yml`, and `deploy` — frozen Go/PostgreSQL rollback
  implementation; these are not the active production runtime.
- `tests/e2e` — Playwright product workflow tests.

Source precedence is deterministic:

- App Store Connect: store engagement, downloads and Apple sales.
- RevenueCat: trials, paid conversion, renewals, churn and subscription revenue.
- PostHog: activation, funnels, feature usage and product retention.
- Superwall: paywall views, experiments and paywall conversion.
- AppClimb first-party analytics: web referrers, UTM attribution, landing-page
  journeys, explicit web goals, and server-observed crawler requests.

User-level joins are disabled unless a workspace explicitly confirms a shared
App User ID. Otherwise AppClimb uses aggregate UTC day and cohort comparisons.
Human traffic and crawler traffic are never combined.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

All large caches should stay on `/Volumes/LexarDev`:

```bash
npm_config_cache=/Volumes/LexarDev/Developer/Caches/npm npm install
GOMODCACHE=/Volumes/LexarDev/Developer/Caches/go-mod go mod download
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run build:cloudflare
npm run cloudflare:api:test
npm run worker:test
npm run test:e2e
```

## Production configuration

The production web Worker reaches `appclimb-api` through the private
`APPCLIMB_API` service binding. The explicit public fallback is:

- `APPCLIMB_API_URL=https://appclimb-api.aydmaxx.workers.dev`

Configured as a secret after creating the `appclimb.app` web property:

- `APPCLIMB_TRACKING_TOKEN=acwa1_...`

The tracking token is a signed public property identifier, not an account
credential. Do not invent a token or reuse an authenticated session token.

The website records `account_created` after successful signup,
`checkout_started` after Paddle opens a checkout, and `paid_activated` only
after the backend confirms an active paid entitlement.

Required public checkout values:

- `NEXT_PUBLIC_PADDLE_ENV=production`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- `NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID=pri_01ky7e3rhgefr89ye58sw6br8h`
- `NEXT_PUBLIC_PADDLE_YEARLY_PRICE_ID=pri_01ky7e4f18n7423rd415re8ehb`

API secrets and non-secret bindings are declared by name in
`cloudflare/api/wrangler.jsonc`; secret values are set with Wrangler and never
committed. Connector credentials are encrypted with a random per-connection
data key; the data key is then encrypted by the Worker master key.
Credentials, refresh sessions, billing payloads and sync jobs never reach the
browser.

Password recovery uses single-use SHA-256 token hashes with a 30-minute
expiry. Cloudflare Email Service delivers messages through the `EMAIL` binding
from `no-reply@appclimb.app`; no SMTP password is stored by AppClimb.

The frontend and API are designed for Cloudflare Workers. Configure Paddle
webhooks at `https://appclimb.app/api/paddle/webhook`; the canonical Next.js
route forwards through the private API service binding.

Pushes to `main` run `.github/workflows/cloudflare-deploy.yml`, apply D1
migrations, and deploy both Workers after verification. Production operations,
smokes, backup locations, and rollback boundaries are in
[ops/README.md](./ops/README.md).

## Provider notes

- Apple Analytics imports use a team key with the `Sales and Reports` role.
  An Admin must initialize Analytics Reports once if the app has no active
  report request; the first downloadable report can take 1–2 days:
  <https://developer.apple.com/documentation/AppStoreConnectAPI/downloading-analytics-reports>
- RevenueCat uses API v2 Bearer keys with charts read permission:
  <https://www.revenuecat.com/docs/api-v2>
- PostHog scheduled exports must not misuse the ad-hoc `/query` endpoint:
  <https://posthog.com/docs/api/queries>
- PostHog OAuth is a public PKCE client identified by the canonical CIMD
  document at `https://appclimb.app/api/oauth/posthog/client`. Keep the
  `appclimb.app` origin, metadata URL, callback URI, and scoped OAuth cookie
  path aligned; `www.appclimb.app` redirects to the canonical host before the
  flow starts.
- Superwall uses API v2: <https://api.superwall.com/docs>
- Paddle webhook signatures cover the exact `timestamp:rawBody` bytes:
  <https://developer.paddle.com/webhooks/about/signature-verification>

The privacy, terms and refund pages describe the implemented product behavior.
Independent legal review remains a launch-owner responsibility.

## Organic discovery

Public discovery is generated from the Next.js App Router:

- `/robots.txt` and `/sitemap.xml` expose canonical, indexable pages.
- `/manifest.webmanifest`, `/favicon.ico`, `/icon.svg` and the Apple/PWA icons
  provide consistent browser and search branding.
- `/opengraph-image` supplies the social preview.
- `/feed.xml` publishes the editorial RSS feed.
- `/llms.txt` and `/pricing.md` expose factual, machine-readable product status
  and pricing for non-Google agents. Google does not use these files as a
  ranking signal.
- Production deploys notify IndexNow after the canonical sitemap is live.

The topic map, visibility baseline, authority pipeline and publishing checklist
live in [`marketing/organic-growth`](./marketing/organic-growth/README.md).
