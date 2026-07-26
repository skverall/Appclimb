# AppClimb production operations

AppClimb production runs on Cloudflare. Read
[`ops/cloudflare-migration.md`](./cloudflare-migration.md) for the cutover
record and rollback artifacts. The Hostinger Compose project is stopped and is
not an active backend.

## Production topology

- `appclimb-web` runs Next.js 16 through OpenNext on Cloudflare Workers.
- `appclimb-api` is the Hono API Worker.
- The web Worker reaches the API through the private `APPCLIMB_API` service
  binding; the public `workers.dev` API URL remains an operational fallback.
- `appclimb-production` is the primary D1 database.
- `appclimb-sync` processes source imports and retry work.
- `appclimb-backups` retains migration and operational exports.
- Cloudflare Email Service sends password-reset messages from
  `no-reply@appclimb.app`.
- Cloudflare DNS owns `appclimb.app` and `www.appclimb.app`.

The canonical PostHog OAuth metadata, callback, Paddle webhook, first-party
collector, and browser application remain on `https://appclimb.app`.

## Release boundary

`.github/workflows/cloudflare-deploy.yml` is the only production deployment
workflow. A push to `main`:

1. verifies lint, types, unit coverage, API tests, and the OpenNext build;
2. applies D1 migrations;
3. deploys the API Worker;
4. deploys the web Worker;
5. verifies the public API, private service binding, canonical domain, and
   sitemap; and
6. notifies IndexNow.

A Worker upload alone is not proof that a cross-stack feature is live. Record
the exact code release, D1 migration, binding/secret configuration, canonical
domain response, and first accepted real event separately.

## Health and smoke checks

- API liveness:
  `https://appclimb-api.aydmaxx.workers.dev/healthz`
- API readiness:
  `https://appclimb-api.aydmaxx.workers.dev/readyz`
- web-to-API binding:
  `https://appclimb.app/api/health`
- bounded public API smoke: `./ops/smoke.sh`
- recent Worker logs: Cloudflare Workers & Pages → the relevant Worker →
  Observability

`/api/health` must report `backend: "ready"` and, after the canonical domain
cutover, `backendOrigin: "https://appclimb-api.internal"`.

Run the isolated account lifecycle only against staging:

```sh
APPCLIMB_E2E_ACCOUNT_LIFECYCLE=1 \
APPCLIMB_E2E_ISOLATED_BACKEND_URL=https://appclimb-api-staging.aydmaxx.workers.dev \
npm run test:e2e:account
```

The test creates uniquely prefixed data and deletes it. The Playwright guard
rejects the canonical domain, the production Worker, and the legacy VPS host.

## D1 migrations and recovery

Apply committed D1 migrations with:

```sh
npm run cloudflare:d1:staging
npm run cloudflare:d1:production
```

Before a risky production data change, record a D1 Time Travel bookmark. Use
bounded SQL, inspect the exact target first, and reconcile affected row counts
afterward. Never restore an old PostgreSQL dump over a D1 database that has
accepted newer production writes.

The one-time PostgreSQL converter and import scripts remain under
`cloudflare/api/scripts` only for migration audit and disaster recovery. They
are not the normal release path.

## Source imports

Source credentials are envelope-encrypted in D1. Queue consumers decrypt them
only inside the API Worker and make read-only provider requests. Both
`connected` and `needs-attention` sources remain eligible for manual and
scheduled retries. `no_data_in_window` is a truthful no-data state, not a
credential failure and not a reason to stop future syncs.

Cron schedules:

- `17 */6 * * *` — enqueue due source imports;
- `7 * * * *` — refresh up to 15 due App Store keyword observations;
- `43 2 * * *` — enforce first-party analytics retention.
- `23 3 * * *` — enqueue due weekly AI Visibility scans for entitled
  workspaces.

For an incident, inspect the latest `sync_jobs`, the source
`last_error_code`, Queue delivery attempts, and Worker logs before reconnecting
or deleting a source.

## Secrets and bindings

Never print or commit secret values. The API Worker requires:

- `JWT_SECRET`
- `ENVELOPE_MASTER_KEY`
- `INTERNAL_SYNC_TOKEN`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_PRODUCT_ID`
- `PADDLE_PRODUCT_IDENTITY`
- `PADDLE_ALLOWED_PRICE_IDS`
- `DEEPSEEK_API_KEY`

It also requires the `DB`, `SYNC_QUEUE`, `BACKUPS`, rate-limit, and `EMAIL`
bindings declared in `cloudflare/api/wrangler.jsonc`.

The web Worker requires:

- the private `APPCLIMB_API` service binding;
- `APPCLIMB_TRACKING_TOKEN`;
- the public Paddle build values documented in the root README.

GitHub Actions requires the restricted repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Backup and rollback

The final frozen PostgreSQL backup is retained at:

- VPS: `/opt/backups/appclimb/appclimb-20260726T132635Z.sql.gz`
- R2:
  `appclimb-backups/postgres-final-cutover/appclimb-20260726T132635Z.sql.gz`
- SHA-256:
  `b4bd7350a9d4b498dbda4c171e7f71838fd092cd7b7668ffe4dae19c68cc764d`

The Hostinger `appclimb-api-1` and `appclimb-worker-1` containers are stopped.
`appclimb-db-1` remains healthy only as a rollback artifact during the
observation window. The retained Vercel deployment is a frontend rollback
artifact only; authoritative DNS and both production custom domains now point
to `appclimb-web`.

Do not restart the stale VPS API/worker as primary without first reconciling
newer D1 writes or explicitly accepting the bounded data-loss window. A
rollback must be scoped to AppClimb and must not touch unrelated VPS projects,
containers, ingress, volumes, or backups.
