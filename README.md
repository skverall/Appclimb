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
own `appclimb.app` property: the production migration, collector API, signed
property token, and first human/crawler events were verified on 2026-07-25.
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
- `src/lib` — browser-safe contracts, request validation, connector clients and
  a server-only API session client. Diagnosis, envelope encryption and Paddle
  signature verification live in `worker`, not here.
- `public/appclimb-analytics.js` — small first-party browser collector;
  `src/proxy.ts` forwards recognized crawler requests separately.
- `worker` — Go API and recurring sync worker with Postgres migrations,
  envelope encryption, RLS, bounded pagination, reconciliation, retries, UTC
  windows and 90-day retention.
- `compose.yml` — isolated API, worker and Postgres services for Hostinger VPS.
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
npm run worker:test
npm run test:e2e
```

## Production configuration

Required Vercel server-only value:

- `APPCLIMB_API_URL=https://appclimb.srv1300823.hstgr.cloud`

Configured in production after creating the `appclimb.app` web property:

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

Hostinger API secrets are documented in `.env.backend.example` and never belong
in Vercel. Connector credentials are encrypted with a random per-connection
data key; the data key is then encrypted by the backend master key. Credentials,
refresh sessions, billing payloads and sync jobs never reach the browser.

The frontend is designed for Vercel. The Go API and worker ship in the same
distroless image for the existing Hostinger container environment. Configure
Paddle webhooks directly at
`https://appclimb.srv1300823.hstgr.cloud/v1/billing/webhook`; the Next.js route
is retained only as a compatibility proxy.

Pushes to `main` run `.github/workflows/vercel-deploy.yml`, verify the complete
Node/Go release candidate, and deploy only the Vercel frontend. Backend and
database changes still require the explicit Hostinger procedure in
[ops/README.md](./ops/README.md); a green Vercel deployment is not proof that a
new Go route or migration is live.

## Provider notes

- Apple Analytics Reports are asynchronous and the first ongoing report can
  take 1–2 days: <https://developer.apple.com/documentation/AppStoreConnectAPI/downloading-analytics-reports>
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
