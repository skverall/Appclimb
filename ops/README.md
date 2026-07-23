# AppClimb backend operations

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
