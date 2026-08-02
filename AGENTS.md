<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Canonical product direction

Before any product, design, roadmap, positioning, data-model, integration, or
architecture work, read `PRODUCT_DIRECTION.md` completely.

Treat it as the product north star. AppClimb is a free App Store keyword tool
(popularity + difficulty estimates from public iTunes data) — not the Growth CI
SaaS that preceded it. If a request implies reintroducing accounts, connectors,
billing, or third-party analytics, surface the conflict instead of silently
changing direction.

# Current handoff map

- Read `README.md` for the repository, verification, and deployment map.
- Read `ops/README.md` before production deployment or Cloudflare work.
- A push to `main` runs `.github/workflows/cloudflare-deploy.yml` and deploys
  the OpenNext web Worker (`appclimb-web`). There is no API worker, no D1
  database, no queues, and no cron — the tool is fully client-side and queries
  Apple's public iTunes Search API from the browser (Apple blocks Worker IPs).
- Production is Cloudflare Workers (web only) at `https://appclimb.app`.
  `worker/` (Go), `deploy/`, and `compose.yml` are frozen rollback artifacts
  from earlier architectures; never treat them as the current backend.
- Keyword data honesty rules: popularity and difficulty are estimates derived
  from public signals and MUST be labeled as estimates in the UI. Never claim
  real Apple Search Ads volume. History lives in localStorage
  (`appclimb:kw:v1:*`) with an estimated backfill flagged `backfilled: true`.
- For any live-data claim, verify repository code and the deployed site
  separately; the site runs client-side logic that unit tests do not execute.
- A push to `main` is a production deploy. Do not push or deploy without
  founder approval.
