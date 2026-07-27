# AppClimb — Growth CI for iOS subscription apps

AppClimb is **Growth CI** for AI-built iOS subscription apps.

> Your agents ship. AppClimb proves whether the release helped.

AppClimb connects **RevenueCat** and **PostHog**, evaluates every iOS release,
creates one evidence-backed growth task for the coding agent you already use,
and closes that task only when real production data confirms the fix.

The canonical product north star lives in
[PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md). Read it before changing product
direction or expanding the feature set.

## Product surface (active)

- **Release verdict** — every observed version/build gets a collection or
  evaluation state with confidence and limitations.
- **One Growth Incident** — only a confirmed regression opens work; one open
  incident per app.
- **One Agent Task** — portable, machine-readable packet for Hermes / Codex /
  Grok / Claude (or any HTTP client).
- **Verification** — task closes from production cohort evidence, not agent
  claims, green tests, or PR merge alone.
- **Settings** — app identity, RevenueCat, PostHog, measurement mapping,
  Growth Contract summary, Agent Bridge tokens, billing/account.
- **Billing** — founding Pro price `$12.99/month` or `$129/year` via Paddle;
  new users get the **first release verdict free** (existing entitlements preserved).

Demo and marketing may show a clearly labeled **synthetic** complete loop.
Private workspaces never fall back to synthetic metrics.

## Documentation map

- [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md) — canonical product direction
- [docs/growth-ci.md](./docs/growth-ci.md) — loop, objects, Agent Bridge
- [docs/adr/0001-growth-ci-pivot.md](./docs/adr/0001-growth-ci-pivot.md) — pivot ADR
- [ops/README.md](./ops/README.md) — production topology, smoke, backup, rollback
- [public/pricing.md](./public/pricing.md) — machine-readable pricing/status
- [docs/acquisition-atlas.md](./docs/acquisition-atlas.md) — legacy first-party
  web collection notes (not the customer Growth CI product)

Archive recovery ref: `archive/pre-growth-ci-2026-07-28`

## Architecture

- `src/app` — Next.js 16 App Router, route handlers, legal/auth pages
- `src/components` — Growth CI UI (single primary workspace + Settings)
- `src/lib` — contracts, validation, browser-safe adapters, server API client
- `cloudflare/api` — Hono API Worker, D1 migrations, encryption, sync,
  release-impact engine, Agent Bridge, billing, queues
- `wrangler.jsonc` — OpenNext web Worker + private API service binding
- `worker`, `compose.yml`, `deploy` — frozen Go/PostgreSQL rollback artifacts only

### Core sources

- **RevenueCat** — trials, paid conversion, renewals, churn, revenue (money ledger)
- **PostHog** — session, activation, version-aware cohorts (behavior ledger)

User-level joins remain disabled unless an explicit future identity contract is
approved. Aggregate UTC day and version cohort comparisons are the default.

### Rollout flags (API Worker vars)

| Flag | Staging | Production (until launch gate) |
| --- | --- | --- |
| `GROWTH_CI_ENABLED` | `true` | `false` |
| `AGENT_BRIDGE_ENABLED` | `true` | `false` |
| `LEGACY_SURFACES_ENABLED` | `false` | `false` |

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Large caches should stay on `/Volumes/LexarDev`:

```bash
npm_config_cache=/Volumes/LexarDev/Developer/Caches/npm npm install
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run cloudflare:api:test
npm run build
npm run build:cloudflare
npm run test:e2e
```

Do not claim staging or production verification unless those environments were
actually exercised with founder approval.

## Production configuration

The production web Worker reaches `appclimb-api` through the private
`APPCLIMB_API` service binding. Public API fallback:

- `APPCLIMB_API_URL=https://appclimb-api.aydmaxx.workers.dev`

Paddle:

- `NEXT_PUBLIC_PADDLE_ENV=production`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- `NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID=pri_01ky7e3rhgefr89ye58sw6br8h`
- `NEXT_PUBLIC_PADDLE_YEARLY_PRICE_ID=pri_01ky7e4f18n7423rd415re8ehb`

API secrets are set with Wrangler and never committed. Connector credentials use
envelope encryption. Agent tokens are stored as cryptographic hashes only.

Pushes to `main` run `.github/workflows/cloudflare-deploy.yml`, apply D1
migrations, and deploy both Workers after verification. **Do not merge
`feat/growth-ci` or deploy production without explicit founder approval.**

## Agent integration

Agents authenticate with app-scoped tokens (`APPCLIMB_AGENT_TOKEN`) against the
Agent Bridge HTTP API. See:

- [docs/growth-ci.md](./docs/growth-ci.md)
- [docs/agent-skill/appclimb-growth-ci.md](./docs/agent-skill/appclimb-growth-ci.md)
  (added with Agent Bridge implementation)

Agents must never merge, deploy, change pricing/paywalls, or mutate third-party
systems automatically.

## Provider notes

- RevenueCat API v2 charts read permission:
  <https://www.revenuecat.com/docs/api-v2>
- PostHog query/OAuth notes remain as implemented; OAuth uses PKCE + CIMD at
  `https://appclimb.app/api/oauth/posthog/client`
- Paddle webhook signatures cover exact `timestamp:rawBody` bytes

The privacy, terms and refund pages describe implemented product behavior.
Independent legal review remains a launch-owner responsibility.
