<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Canonical product direction

Before any product, design, roadmap, positioning, data-model, integration, or
architecture work, read `PRODUCT_DIRECTION.md` completely.

Treat it as the product north star. AppClimb is a freemium App Store keyword
tool: a free plan with honest daily limits (8 keyword checks, 5 assistant
messages, 1 tracked app) plus an optional Pro plan at $8/month ($64/year) with
cloud sync — not the Growth CI SaaS that preceded it, and never a tool with a
login wall. If a request implies reintroducing user-connected connectors,
team features, pricing above $10/month, or third-party analytics, surface the
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
  `/api/me`, `/api/sync`, Paddle webhook — all inert until `PRO_ENABLED` /
  `NEXT_PUBLIC_PRO_ENABLED` are turned on. Anonymous keyword data never leaves
  the browser; only a signed-in Pro user's own data may be synced to D1.
- Keyword data honesty rules: popularity is Apple Ads official relative 1–100
  when `POST /api/popularity` hits, otherwise an iTunes estimate. Difficulty
  is always an estimate. Both MUST be labeled with their source. Never claim
  search volume. History lives in localStorage (`appclimb:kw:v1:*`) with an
  estimated backfill flagged `backfilled: true`.
- For any live-data claim, verify repository code and the deployed site
  separately; the site runs client-side logic that unit tests do not execute.
- A push to `main` deploys to production immediately, so run `npm run check`
  and `npm run test:e2e` locally before pushing.
