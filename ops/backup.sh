#!/bin/sh
set -eu

project_dir=${APPCLIMB_PROJECT_DIR:-/opt/apps/appclimb}
backup_dir=${APPCLIMB_BACKUP_DIR:-/opt/backups/appclimb}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
output="$backup_dir/appclimb-$timestamp.sql.gz"

install -d -m 0700 "$backup_dir"
cd "$project_dir"
docker compose exec -T db sh -lc \
  'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip -9 > "$output"
chmod 0600 "$output"
sha256sum "$output" > "$output.sha256"
chmod 0600 "$output.sha256"

find "$backup_dir" -type f -name 'appclimb-*.sql.gz' -mtime +30 -delete
find "$backup_dir" -type f -name 'appclimb-*.sql.gz.sha256' -mtime +30 -delete
printf '%s\n' "$output"
