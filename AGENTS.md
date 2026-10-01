<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Canonical product direction

Before any product, design, roadmap, positioning, data-model, integration, or
architecture work, read `PRODUCT_DIRECTION.md` completely.

Treat it as the product north star. AppClimb is a freemium App Store keyword
tool: guests can search keywords (8 checks/day) with no login wall; a free
account unlocks 1 tracked app and the ASO assistant (5 messages/day); Pro is
$8/month ($64/year) with cloud sync. Not the Growth CI SaaS that preceded it.
If a request implies a login wall on search, user-connected connectors, team
features, pricing above $10/month, or third-party analytics, surface the
conflict instead of silently changing direction.

# Current handoff map

- Read `README.md` for the repository, verification, deployment, and
  monetization-setup map.
- Read `ops/README.md` before production deployment or Cloudflare work.
- A push to `main` runs `.github/workflows/cloudflare-deploy.yml`: it builds
  the OpenNext Worker, applies D1 migrations, and deploys `appclimb-web`.
  There are no queues and no cron. The core tool queries Apple's public
  iTunes Search API from the browser (Apple blocks Worker IPs).
- Production is Cloudflare Workers + D1 (`appclimb-db`; staging
  `appclimb-db-staging`) at `https://appclimb.app`. `worker/` (Go), `deploy/`,
  and `compose.yml` are frozen rollback artifacts from earlier architectures;
  never treat them as the current backend.
- Monetization backend (ADR 0004) runs in the same Worker: auth routes,
  `/api/me`, `/api/sync`, Paddle webhook. Account chrome and guest gates
  turn on when `NEXT_PUBLIC_PRO_ENABLED=1` or `/api/me` reports
  `configured:true`. Guest keyword data never leaves the browser; only a
  signed-in Pro user's own data may be synced to D1. Tracking and the
  assistant require a free sign-in once accounts are live.
- Keyword data (ADR 0005): Apple Ads Insights publishes, weekly, the top 500
  search terms per genre (15 genres) per storefront with a 1–100 popularity
  score. The Worker keeps those weeks in D1 (`search_term_*` tables,
  `src/lib/search-terms-store.ts`) and serves `POST /api/popularity`
  (exact terms + up to 52 weeks of Apple history) and `GET /api/terms/*`
  (suggest, related, trending). Apple Ads rate-limits bursts: call it
  sequentially with back-off. `.github/workflows/warm-apple-terms.yml`
  preloads new weeks.
- Keyword data honesty rules: popularity is `official` (Apple's score),
  `longtail` (term not in Apple's list → shown as `≤N`, N = genre floor), or
  `estimated` (Apple unreachable; rough iTunes stand-in, labeled `Est.`).
  Difficulty is always an estimate and ships with its evidence. Never claim
  search volume. Never invent history: local storage keeps one real
  snapshot per keyword per day; legacy `backfilled` points are dropped on
  load.
- For any live-data claim, verify repository code and the deployed site
  separately; the site runs client-side logic that unit tests do not execute.
- A push to `main` deploys to production immediately, so run `npm run check`
  and `npm run test:e2e` locally before pushing.
