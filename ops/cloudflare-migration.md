# Cloudflare cutover record

This is the audit record for AppClimb's move from Vercel + Hostinger to
Cloudflare on 2026-07-26. The canonical production architecture is documented
in [`ops/README.md`](./README.md). Do not use this one-time migration sequence
as the normal release runbook.

## Target and resource inventory

- Next.js 16: `appclimb-web` through OpenNext
- Hono API: `appclimb-api`
- D1: `appclimb-production`
  (`1152128e-50d5-49a3-8e4b-cf5b3b97b20e`)
- Queue: `appclimb-sync`
- R2: `appclimb-backups`
- DNS zone: `appclimb.app`
  (`e0aa28c48b2663ddad8528e2db1fda81`)
- Email sender: `no-reply@appclimb.app`

Staging uses the corresponding `*-staging` Workers, Queue, bucket, and D1
database `31030da6-be26-4ff6-a0c5-26c9aeeb5406`.

The web Worker uses the private `APPCLIMB_API` service binding. The public API
fallback is `https://appclimb-api.aydmaxx.workers.dev`.

## Completed gates

- Workers Paid is active.
- Production API and web Workers are healthy with full observability.
- The Vercel production bridge was pointed at the Cloudflare API before the
  Hostinger write freeze, so new writes moved to D1 before DNS propagation.
- The complete production account lifecycle passed against the Cloudflare API:
  signup, truthful Sources empty state, password change, re-login, and account
  deletion.
- The API CPU ceiling is 60 seconds and the web proxy timeout is 75 seconds so
  the two imported high-cost Go password hashes can be verified and replaced
  without weakening their parameters.
- New passwords use the OWASP minimum Argon2id profile
  `m=19456,t=2,p=1`; imported `m=65536,t=3,p=2` Go hashes remain verifiable.
- Invalid Paddle webhook signatures return `401`.
- PostHog OAuth CIMD metadata returns `200` from the canonical URL.
- The imported PostHog connection completed a fresh Cloudflare Queue job. Its
  truthful result is `needs-attention / no_data_in_window`; no metric rows were
  invented.
- `needs-attention` sources are eligible for both manual and scheduled retries.
- A new GPTBot request increased only the model-training crawler category in
  D1.
- `/`, `/login`, `/pricing`, `/forgot-password`, `/sitemap.xml`, and
  `/api/oauth/posthog/client` return `200`; `www` returns the canonical `308`.
- Cloudflare reports the zone active, both canonical custom domains are
  attached to `appclimb-web`, and an authoritative edge check reports
  `server: cloudflare` plus
  `backendOrigin: "https://appclimb-api.internal"`.
- Cloudflare Email Sending is active with SPF, DKIM, DMARC, and the restricted
  `no-reply@appclimb.app` sender. A privacy-preserving production reset request
  returned `202`, and Cloudflare counted one sent message against the active
  daily quota.
- The Vercel production workflow was retired in the repository and the
  Cloudflare workflow is the sole push-to-`main` release path.

## Final data transfer

Write freeze began after stopping only the AppClimb `api` and `worker`
containers. The PostgreSQL container remains healthy as a rollback artifact.

Final backup:

- VPS: `/opt/backups/appclimb/appclimb-20260726T132635Z.sql.gz`
- R2:
  `appclimb-backups/postgres-final-cutover/appclimb-20260726T132635Z.sql.gz`
- SHA-256:
  `b4bd7350a9d4b498dbda4c171e7f71838fd092cd7b7668ffe4dae19c68cc764d`

D1 Time Travel bookmarks:

- before import:
  `00000007-00000000-000050b4-41e67fbeb926ebb7747d6cd62069bc35`
- immediately after import:
  `00000007-00000027-000050b4-25e7d27a267fa972a4dc5aae9494e0a5`

The import executed 235 queries, read 824 rows, and wrote 1,311 rows. All 24
source-table counts matched:

| Table | Rows |
| --- | ---: |
| action_proposals | 0 |
| apps | 2 |
| audit_events | 9 |
| billing_events | 0 |
| change_events | 0 |
| diagnosis_runs | 8 |
| evidence | 0 |
| experiments | 0 |
| insights | 0 |
| keyword_rank_points | 0 |
| keyword_tracks | 0 |
| metric_points | 0 |
| paddle_checkout_bindings | 0 |
| password_reset_tokens | 0 |
| refresh_sessions | 17 |
| schema_migrations | 7 |
| source_connections | 1 |
| sync_jobs | 1 |
| users | 2 |
| web_crawler_events | 10 |
| web_events | 149 |
| web_properties | 1 |
| workspace_members | 2 |
| workspaces | 2 |

The later auth and crawler smokes created only uniquely prefixed temporary
accounts, deleted them, and added the explicitly documented crawler event.

## DNS cutover

Namecheap was changed from BasicDNS to:

- `harley.ns.cloudflare.com`
- `norah.ns.cloudflare.com`

Cloudflare imported and retained the apex/www web records, five Namecheap email
forwarding MX records, SPF TXT, and Google site-verification TXT before
delegation. Cloudflare reported the zone active at
`2026-07-26T14:23:02.205771Z`.

The old apex/www Vercel A records were then removed and replaced atomically by
Cloudflare-managed custom domains attached to `appclimb-web`:

- `appclimb.app`
- `www.appclimb.app`

Authoritative DNS returns Cloudflare anycast addresses. The canonical health
route reports the private `appclimb-api.internal` binding, while `www`
redirects to the apex host.

Cloudflare Email Sending owns the isolated `cf-bounce.appclimb.app` return
path. Its generated MX, SPF, DKIM, and DMARC records coexist with the retained
Namecheap forwarding records for the apex domain. The Worker can send only
from `no-reply@appclimb.app`.

## Rollback boundary

Before DNS activation, Vercel served the frontend while using the Cloudflare
API. After D1 accepted production writes, the frozen PostgreSQL database ceased
to be a lossless primary. After custom-domain activation, Vercel became a
rollback artifact and no longer receives authoritative production traffic.

Never blindly restart the old VPS API/worker. First export and reconcile newer
D1 writes or explicitly accept the bounded data-loss window. Keep the scoped
Hostinger backup and Vercel deployment during the observation period; they are
rollback artifacts, not active release targets.
