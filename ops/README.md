# AppClimb production operations

AppClimb production is a single Cloudflare Worker plus a D1 database. Read
[`ops/cloudflare-migration.md`](./cloudflare-migration.md) for the historical
cutover record and rollback artifacts. There is no queue and no cron — the
keyword tool runs in the visitor's browser and queries Apple's public iTunes
Search API directly. The optional account/billing/sync backend (ADR 0004)
lives in the same Worker with D1.

## Production topology

- `appclimb-web` runs Next.js 16 through OpenNext on Cloudflare Workers.
- `appclimb-db` is the production D1 database (binding `DB`); the staging
  Worker `appclimb-web-staging` uses its own `appclimb-db-staging`.
- Cloudflare DNS owns `appclimb.app` and `www.appclimb.app`; the canonical
  production host is `https://appclimb.app`.
- `worker/` (Go), `deploy/`, and `compose.yml` in the repository are frozen
  rollback artifacts from earlier architectures and are never deployed.

## Release boundary

`.github/workflows/cloudflare-deploy.yml` is the only production deployment
workflow. A push to `main`:

1. typechecks the codebase;
2. builds the OpenNext Worker (`npm run build:cloudflare`);
3. applies pending D1 migrations (`wrangler d1 migrations apply appclimb-db --remote`);
4. deploys the web Worker;
5. verifies the canonical homepage, waits for the sitemap, and notifies
   IndexNow.

A Worker upload alone is not proof that a feature is live for visitors: the
estimation logic runs client-side, so verify against the deployed site.

## Health and smoke checks

- Canonical homepage: `curl https://appclimb.app/`
- Sitemap: `https://appclimb.app/sitemap.xml`
- Account backend: `curl https://appclimb.app/api/me` (200 JSON;
  `configured:false` until D1 and `PRO_ENABLED` are in place)
- Recent Worker logs: Cloudflare Workers & Pages → `appclimb-web` →
  Observability
- The repo's E2E suite (`npm run test:e2e`) starts a local production build
  and checks the explorer, marketing pages, and crawl endpoints.

## Secrets

GitHub Actions requires the restricted repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for deploys. Public
build-time values (`NEXT_PUBLIC_*`, see README "Monetization setup") are
GitHub Actions **variables**.

Worker secrets (never commit; `npx wrangler secret put`):

- `DEEPSEEK_API_KEY` — ASO Assistant (`POST /api/chat`)
- `APPLE_ADS_CLIENT_ID`, `APPLE_ADS_TEAM_ID`, `APPLE_ADS_KEY_ID`,
  `APPLE_ADS_PRIVATE_KEY`, `APPLE_ADS_ACCOUNT_ID` — official popularity
  overlay (`POST /api/popularity`). Without them the UI falls back to the
  iTunes estimate. Use the founder Ads account only; visitors never connect.
- `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET` — billing webhook + portal
- `RESEND_API_KEY` — magic-link email
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google sign-in
- `PRO_ENABLED` (= `1`) — enables plan quotas and account keying

Staging uses the same secret names under `--env staging`.

## Backup and rollback

The repository is the product state for code. D1 holds the monetization data:
user accounts, sessions, subscriptions, and Pro sync blobs.

- **Backup D1**: `npx wrangler d1 export appclimb-db --remote --output backup.sql`
  (and `appclimb-db-staging` for staging). Run before destructive migrations.
- **Rollback**: `git revert` on `main` redeploys the previous Worker; D1
  migrations are forward-only, so restore from a `d1 export` snapshot when a
  migration must be undone.

Visitors' keyword history lives in their browsers unless they are Pro users
who enabled sync — those blobs live in D1 and are covered by the export.

Historical artifacts (frozen PostgreSQL dump, stopped Hostinger containers,
retained Vercel deployment) are documented in
[`ops/cloudflare-migration.md`](./cloudflare-migration.md). Git history —
including tags `archive/pre-growth-ci-2026-07-28` and
`archive/pre-aso-tool-2026-08-02` — is the recovery path for prior product
architectures.
