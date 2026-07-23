#!/bin/sh
set -eu

base_url=${APPCLIMB_API_URL:-https://appclimb.srv1300823.hstgr.cloud}
curl --fail --silent --show-error "$base_url/healthz"
printf '\n'
curl --fail --silent --show-error "$base_url/readyz"
printf '\n'

unauthorized_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "$base_url/v1/me")
test "$unauthorized_status" = "401"

invalid_webhook_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' \
  "$base_url/v1/billing/webhook")
test "$invalid_webhook_status" = "401"

printf 'PUBLIC_SMOKE_OK\n'
