# AppClimb Web — River Atlas

AppClimb is a visual growth diagnosis workspace for independent iOS
subscription apps.

> See where your app stops growing — and what to fix next.

The primary product loop is **Observe → Diagnose → Experiment → Learn**. The
demo workspace is available at `/`; AppClimb authentication starts at `/login`.

## Product surface

- Growth River: Discover → Store → Install → Activate → Paywall → Trial → Paid
  → Renew.
- Evidence inspector with at most three ranked opportunities.
- Growth Replay for releases, metadata, screenshots, price and paywall changes.
- Retention heatmap and Voice of Customer clusters.
- Read-only Lab proposals and integration health.
- 14-day no-card entitlement followed by `$12.99/month` or `$129/year`.
- One-page Paddle overlay checkout with a signed webhook as the entitlement
  source of truth.

## Architecture

- `src/app` — Next.js 16 App Router, route handlers and legal/auth pages.
- `src/components` — code-native River Atlas UI.
- `src/lib` — browser-safe contracts, deterministic diagnosis and a server-only
  API session client.
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

User-level joins are disabled unless a workspace explicitly confirms a shared
App User ID. Otherwise AppClimb uses aggregate UTC day and cohort comparisons.

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

## Provider notes

- Apple Analytics Reports are asynchronous and the first ongoing report can
  take 1–2 days: <https://developer.apple.com/documentation/AppStoreConnectAPI/downloading-analytics-reports>
- RevenueCat uses API v2 Bearer keys with charts read permission:
  <https://www.revenuecat.com/docs/api-v2>
- PostHog scheduled exports must not misuse the ad-hoc `/query` endpoint:
  <https://posthog.com/docs/api/queries>
- Superwall uses API v2: <https://api.superwall.com/docs>
- Paddle webhook signatures cover the exact `timestamp:rawBody` bytes:
  <https://developer.paddle.com/webhooks/about/signature-verification>

The privacy, terms and refund pages describe the implemented product behavior.
Independent legal review remains a launch-owner responsibility.
