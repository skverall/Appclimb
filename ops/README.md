# AppClimb production operations

AppClimb production is a single Cloudflare Worker. Read
[`ops/cloudflare-migration.md`](./cloudflare-migration.md) for the historical
cutover record and rollback artifacts. There is no API Worker, no D1 database,
no queue, and no cron — the keyword tool runs entirely in the visitor's
browser and queries Apple's public iTunes Search API directly.

## Production topology

- `appclimb-web` runs Next.js 16 through OpenNext on Cloudflare Workers.
- Cloudflare DNS owns `appclimb.app` and `www.appclimb.app`; the canonical
  production host is `https://appclimb.app`.
- Staging is the `appclimb-web-staging` Worker, deployed on demand.
- `worker/` (Go), `deploy/`, and `compose.yml` in the repository are frozen
  rollback artifacts from earlier architectures and are never deployed.

## Release boundary

`.github/workflows/cloudflare-deploy.yml` is the only production deployment
workflow. A push to `main`:

1. typechecks the codebase;
2. builds the OpenNext Worker (`npm run build:cloudflare`);
3. deploys the web Worker;
4. verifies the canonical homepage, waits for the sitemap, and notifies
   IndexNow.

A Worker upload alone is not proof that a feature is live for visitors: the
estimation logic runs client-side, so verify against the deployed site.

## Health and smoke checks

- Canonical homepage: `curl https://appclimb.app/`
- Sitemap: `https://appclimb.app/sitemap.xml`
- Recent Worker logs: Cloudflare Workers & Pages → `appclimb-web` →
  Observability
- The repo's E2E suite (`npm run test:e2e`) starts a local production build
  and checks the explorer, marketing pages, and crawl endpoints.

## Secrets

The web Worker requires no secrets. GitHub Actions requires the restricted
repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for
deploys.

## Backup and rollback

The repository itself is the product state: there is no server-side data to
back up. Visitors' keyword history lives in their browsers.

Historical artifacts (frozen PostgreSQL dump, stopped Hostinger containers,
retained Vercel deployment) are documented in
[`ops/cloudflare-migration.md`](./cloudflare-migration.md). Git history —
including tags `archive/pre-growth-ci-2026-07-28` and
`archive/pre-aso-tool-2026-08-02` — is the recovery path for prior product
architectures.
