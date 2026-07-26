#!/usr/bin/env bash
set -euo pipefail

target=${1:-}
case "$target" in
  staging)
    database=appclimb-staging
    wrangler_environment=staging
    ;;
  production)
    database=appclimb-production
    wrangler_environment=
    ;;
  *)
    echo "usage: $0 <staging|production>" >&2
    exit 2
    ;;
esac

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
api_dir=$(cd "$script_dir/.." && pwd)
project_dir=$(cd "$api_dir/../.." && pwd)
config="$api_dir/wrangler.jsonc"
ssh_helper=${HOSTINGER_SSH_HELPER:-/Users/shokhabbos/.codex/skills/hostinger-backend/scripts/hostinger-ssh}
temp_root=${APPCLIMB_TEMP_ROOT:-/Volumes/LexarDev/Developer/Temp}

if [[ ! -x "$ssh_helper" ]]; then
  echo "Hostinger SSH helper is missing or not executable: $ssh_helper" >&2
  exit 2
fi
mkdir -p "$temp_root"
migration_temp=$(mktemp -d "$temp_root/appclimb-d1-import.XXXXXX")
snapshot_sql="$migration_temp/postgres-snapshot.sql"

cleanup() {
  if [[ -f "$snapshot_sql" ]]; then
    rm "$snapshot_sql"
  fi
  rmdir "$migration_temp" 2>/dev/null || true
}
trap cleanup EXIT

echo "Generating a one-time SQL snapshot outside the repository..."
"$ssh_helper" \
  "cd /opt/apps/appclimb && docker compose exec -T db psql -X -qAt -U appclimb -d appclimb" \
  < "$script_dir/export-postgres.sql" \
  | node "$script_dir/postgres-to-d1.mjs" \
  > "$snapshot_sql"
test -s "$snapshot_sql"

echo "Current D1 Time Travel bookmark:"
npx wrangler d1 time-travel info "$database" \
  --config "$config" \
  --env="$wrangler_environment" \
  --json

echo "Importing PostgreSQL snapshot into $database..."
npx wrangler d1 execute "$database" \
  --remote \
  --config "$config" \
  --env="$wrangler_environment" \
  --file "$snapshot_sql" \
  --yes

echo "Verifying all migrated table counts..."
count_query=$(tr '\n' ' ' < "$script_dir/count-tables.sql")
npx wrangler d1 execute "$database" \
  --remote \
  --config "$config" \
  --env="$wrangler_environment" \
  --command "$count_query" \
  --json

echo "Snapshot import complete. Reconcile these counts with PostgreSQL before cutover."
