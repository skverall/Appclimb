# AppClimb backend operations

## Release boundaries

There are two independent production releases:

- `.github/workflows/vercel-deploy.yml` verifies a push to `main` and deploys
  the Next.js frontend to Vercel.
- The Go API, worker, and PostgreSQL migrations are deployed explicitly to
  Hostinger.

A successful Vercel workflow does not prove that a new Go endpoint or database
migration is live. For cross-stack features, record frontend, backend,
migration, configuration, and first-real-event proof separately.

The production project is isolated at `/opt/apps/appclimb` and uses the
Compose project name `appclimb`. Only `api` joins the shared
`hortiops_default` ingress network. PostgreSQL and the worker remain on the
project-private `appclimb_internal` network.

Database migrations run in the one-shot `migrate` service with
`.env.admin`. API and worker use only the non-superuser
`appclimb_runtime` role from `.env.runtime`; they do not receive the database
admin password. Compose interpolation reads the root-only `.env`.

## Health

- Liveness: `GET /healthz`
- Readiness: `GET /readyz`
- Public smoke: `./ops/smoke.sh`
- Logs: `docker compose logs --since=30m api worker`

`ops/smoke.sh` also verifies that protected Acquisition Atlas reads and the
public collector route exist. Expected unauthenticated/invalid-token responses
are `401`; `404` or `405` means the new API bundle is not running.

## Backend release

Before changing `/opt/apps/appclimb`:

1. Run `npm run check` on the exact source commit.
2. Capture the current source/config bundle, image identity, and database dump
   under `/opt/backups/appclimb-deploys/<timestamp>`.
3. Transfer only the reviewed release source and preserve the root-only
   `.env`, `.env.admin`, and `.env.runtime` files.
4. Build the new image and let the one-shot `migrate` service complete before
   API and worker replacement.
5. Confirm `migrate` exited successfully, then confirm both API and worker are
   healthy.
6. Run `./ops/smoke.sh` against the public endpoint.
7. Inspect API and worker logs for the release window.

Acquisition Atlas introduces migration `006_web_analytics.sql`. It creates
`web_properties`, `web_events`, and `web_crawler_events`, enables and forces
workspace RLS, and adds no new backend secret: signed property tokens reuse the
existing JWT signing key. The Vercel `APPCLIMB_TRACKING_TOKEN` must only be set
after a real property is created through the authenticated API.

Production checkpoint (2026-07-25): migration `006_web_analytics.sql` is
applied under `/opt/apps/appclimb`; API, worker, and database health checks
passed; the `appclimb.app` property token is installed in Vercel; and separate
human plus user-agent-detected crawler events were accepted. The pre-release
bundle and database dump are retained under
`/opt/backups/appclimb-deploys/20260725T155739Z`.

## Backup and restore

`./ops/backup.sh` writes root-only compressed logical dumps with SHA-256
checksums to `/opt/backups/appclimb`. The systemd timer runs daily.

Verify any backup without changing production:

```sh
./ops/restore-rehearsal.sh /opt/backups/appclimb/appclimb-YYYYMMDDTHHMMSSZ.sql.gz
```

The rehearsal creates and drops only the explicit
`appclimb_restore_rehearsal` database inside the AppClimb PostgreSQL
container.

## Rollback

Every deploy must retain the preceding source/config bundle and database dump
under `/opt/backups/appclimb-deploys/<timestamp>`. To roll back:

1. Validate the target bundle checksum.
2. Stop only `/opt/apps/appclimb` with `docker compose down`.
3. Restore its previous directory and image tag.
4. Restore its database dump only if the schema is incompatible.
5. Start the same Compose project and run `./ops/smoke.sh`.

Never run host-wide Docker cleanup and never replace the shared Caddyfile.
