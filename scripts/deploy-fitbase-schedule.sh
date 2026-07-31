#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTION_NAME="${YC_SCHEDULE_FUNCTION_NAME:-zvenfit-fitbase-schedule}"
RUNTIME="${YC_SCHEDULE_RUNTIME:-nodejs22}"
MEMORY="${YC_SCHEDULE_MEMORY:-128m}"
TIMEOUT="${YC_SCHEDULE_TIMEOUT:-15s}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://zvenfit.ru,https://www.zvenfit.ru,https://zvenigorod.zvenfit.ru}"
FITBASE_DOMAIN="${FITBASE_DOMAIN:-zvenfit}"

if [[ -z "${FITBASE_API_TOKEN:-}" ]]; then
  echo "deploy-fitbase-schedule: set FITBASE_API_TOKEN" >&2
  exit 1
fi

if ! command -v yc >/dev/null 2>&1; then
  echo "deploy-fitbase-schedule: install Yandex Cloud CLI (yc)" >&2
  exit 1
fi

if [[ -z "${YC_FOLDER_ID:-}" ]]; then
  echo "deploy-fitbase-schedule: set YC_FOLDER_ID" >&2
  exit 1
fi

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null

if ! yc serverless function get --name="${FUNCTION_NAME}" >/dev/null 2>&1; then
  yc serverless function create --name="${FUNCTION_NAME}"
fi

ENV_ARGS=(
  --environment "FITBASE_API_TOKEN=${FITBASE_API_TOKEN}"
  --environment "FITBASE_DOMAIN=${FITBASE_DOMAIN}"
  --environment "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"
)

if [[ -n "${FITBASE_CLUB_ID:-}" ]]; then
  ENV_ARGS+=(--environment "FITBASE_CLUB_ID=${FITBASE_CLUB_ID}")
fi

yc serverless function version create \
  --function-name="${FUNCTION_NAME}" \
  --runtime="${RUNTIME}" \
  --entrypoint=index.handler \
  --memory="${MEMORY}" \
  --execution-timeout="${TIMEOUT}" \
  --source-path="${ROOT_DIR}/functions/fitbase-schedule" \
  "${ENV_ARGS[@]}"

yc serverless function allow-unauthenticated-invoke "${FUNCTION_NAME}"

INVOKE_URL="$(yc serverless function get --name="${FUNCTION_NAME}" --format=json | node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
const url = data.http_invoke_url || '';
process.stdout.write(url);
")"

if [[ -z "${INVOKE_URL}" ]]; then
  echo "deploy-fitbase-schedule: function deployed, but http_invoke_url is empty" >&2
  echo "deploy-fitbase-schedule: check function HTTP invoke in YC console" >&2
  exit 0
fi

echo "deploy-fitbase-schedule: OK"
echo "SCHEDULE_API_URL=${INVOKE_URL}"
echo "Add SCHEDULE_API_URL to GitHub Actions and rebuild the site."
