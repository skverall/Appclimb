#!/bin/sh
set -eu

base_url=${APPCLIMB_API_URL:-https://appclimb-api.aydmaxx.workers.dev}
curl --fail --silent --show-error "$base_url/healthz"
printf '\n'
curl --fail --silent --show-error "$base_url/readyz"
printf '\n'

unauthorized_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "$base_url/v1/me")
test "$unauthorized_status" = "401"

unauthorized_analytics_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "$base_url/v1/web-analytics")
test "$unauthorized_analytics_status" = "401"

invalid_collector_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' \
  "$base_url/v1/web-analytics/collect")
test "$invalid_collector_status" = "401"

invalid_webhook_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' \
  "$base_url/v1/billing/webhook")
test "$invalid_webhook_status" = "401"

forgot_password_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"email":"appclimb-release-smoke@invalid.example"}' \
  "$base_url/v1/auth/password/forgot")
test "$forgot_password_status" = "202"

invalid_reset_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"token":"invalid","newPassword":"not-a-real-password"}' \
  "$base_url/v1/auth/password/reset")
test "$invalid_reset_status" = "400"

unauthorized_password_change_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' \
  "$base_url/v1/account/password")
test "$unauthorized_password_change_status" = "401"

printf 'PUBLIC_SMOKE_OK\n'
