#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'usage: %s /opt/backups/appclimb/appclimb-*.sql.gz\n' "$0" >&2
  exit 2
fi

backup_file=$1
project_dir=${APPCLIMB_PROJECT_DIR:-/opt/apps/appclimb}
test_db=appclimb_restore_rehearsal

test -f "$backup_file"
test -f "$backup_file.sha256"
cd "$(dirname "$backup_file")"
sha256sum -c "$(basename "$backup_file").sha256"

cd "$project_dir"
docker compose exec -T db sh -lc \
  'dropdb --if-exists -U "$POSTGRES_USER" appclimb_restore_rehearsal && createdb -U "$POSTGRES_USER" appclimb_restore_rehearsal'
gzip -dc "$backup_file" | docker compose exec -T db sh -lc \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" appclimb_restore_rehearsal'
docker compose exec -T db sh -lc \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" appclimb_restore_rehearsal -Atc "select name from schema_migrations order by name"'
docker compose exec -T db sh -lc \
  'dropdb -U "$POSTGRES_USER" appclimb_restore_rehearsal'
printf 'RESTORE_REHEARSAL_OK\n'
