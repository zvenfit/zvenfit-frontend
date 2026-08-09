#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$(mktemp -d /tmp/zvenfit-lead.XXXXXX)"
trap 'rm -rf -- "${SOURCE_DIR}"' EXIT
FUNCTION_NAME="${YC_LEAD_FUNCTION_NAME:-zvenfit-telegram-lead}"
TRIGGER_NAME="${YC_LEAD_RETRY_TRIGGER_NAME:-zvenfit-lead-telegram-retry}"
YDB_DATABASE_NAME="${YDB_DATABASE_NAME:-zvenfit-leads}"
YDB_LEADS_TABLE="${YDB_LEADS_TABLE:-leads}"
LEAD_RETENTION_DAYS="${LEAD_RETENTION_DAYS:-1096}"
MAX_TELEGRAM_ATTEMPTS="${MAX_TELEGRAM_ATTEMPTS:-12}"
YDB_QUERY_TIMEOUT_MS="${YDB_QUERY_TIMEOUT_MS:-5000}"
YDB_SLOW_OPERATION_MS="${YDB_SLOW_OPERATION_MS:-1000}"
YDB_SESSION_POOL_SIZE="${YDB_SESSION_POOL_SIZE:-5}"
RUNTIME="${YC_LEAD_RUNTIME:-nodejs22}"
MEMORY="${YC_LEAD_MEMORY:-256m}"
TIMEOUT="${YC_LEAD_TIMEOUT:-30s}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://zvenfit.ru,https://www.zvenfit.ru,https://zvenigorod.zvenfit.ru}"
LOG_LEVEL="${LOG_LEVEL:-info}"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "deploy-telegram-lead: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID" >&2
  exit 1
fi

if ! command -v yc >/dev/null 2>&1; then
  echo "deploy-telegram-lead: install Yandex Cloud CLI (yc)" >&2
  exit 1
fi

if [[ -z "${YC_FOLDER_ID:-}" ]]; then
  echo "deploy-telegram-lead: set YC_FOLDER_ID" >&2
  exit 1
fi

if [[ -z "${YC_LEAD_SERVICE_ACCOUNT_ID:-}" ]]; then
  echo "deploy-telegram-lead: set YC_LEAD_SERVICE_ACCOUNT_ID for YDB access and timer invocation" >&2
  exit 1
fi

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null

if [[ -z "${YDB_CONNECTION_STRING:-}" ]]; then
  if ! yc ydb database get --name="${YDB_DATABASE_NAME}" >/dev/null 2>&1; then
    yc ydb database create \
      --name="${YDB_DATABASE_NAME}" \
      --description="Durable ZvenFit website leads" \
      --serverless \
      --sls-storage-size=1GB \
      --deletion-protection
  fi

  YDB_CONNECTION_STRING="$(yc ydb database get --name="${YDB_DATABASE_NAME}" --format=json | node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(data.endpoint || '');
")"
fi

if [[ -z "${YDB_CONNECTION_STRING}" ]]; then
  echo "deploy-telegram-lead: YDB connection string is empty" >&2
  exit 1
fi

LEAD_YDB_IAM_TOKEN="$(yc iam create-token)"

YDB_TEST_CONNECTION_STRING="${YDB_CONNECTION_STRING}" \
YDB_ACCESS_TOKEN_CREDENTIALS="${LEAD_YDB_IAM_TOKEN}" \
npm --prefix "${ROOT_DIR}/functions/telegram-lead" run test:integration

YDB_ACCESS_TOKEN_CREDENTIALS="${LEAD_YDB_IAM_TOKEN}" \
YDB_CONNECTION_STRING="${YDB_CONNECTION_STRING}" \
YDB_LEADS_TABLE="${YDB_LEADS_TABLE}" \
YDB_QUERY_TIMEOUT_MS="${YDB_QUERY_TIMEOUT_MS}" \
node "${ROOT_DIR}/functions/telegram-lead/migrate.js"

unset LEAD_YDB_IAM_TOKEN

if ! yc serverless function get --name="${FUNCTION_NAME}" >/dev/null 2>&1; then
  yc serverless function create --name="${FUNCTION_NAME}"
fi

cp \
  "${ROOT_DIR}/functions/telegram-lead/index.js" \
  "${ROOT_DIR}/functions/telegram-lead/handler.js" \
  "${ROOT_DIR}/functions/telegram-lead/lead-store.js" \
  "${ROOT_DIR}/functions/telegram-lead/logger.js" \
  "${ROOT_DIR}/functions/telegram-lead/ydb-client.js" \
  "${ROOT_DIR}/functions/telegram-lead/ydb-config.js" \
  "${ROOT_DIR}/functions/telegram-lead/ydb-observability.js" \
  "${ROOT_DIR}/functions/telegram-lead/package.json" \
  "${ROOT_DIR}/functions/telegram-lead/package-lock.json" \
  "${SOURCE_DIR}/"

yc serverless function version create \
  --function-name="${FUNCTION_NAME}" \
  --runtime="${RUNTIME}" \
  --entrypoint=index.handler \
  --memory="${MEMORY}" \
  --execution-timeout="${TIMEOUT}" \
  --source-path="${SOURCE_DIR}" \
  --service-account-id="${YC_LEAD_SERVICE_ACCOUNT_ID}" \
  --environment TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}" \
  --environment TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID}" \
  --environment ALLOWED_ORIGINS="${ALLOWED_ORIGINS}" \
  --environment YDB_CONNECTION_STRING="${YDB_CONNECTION_STRING}" \
  --environment YDB_LEADS_TABLE="${YDB_LEADS_TABLE}" \
  --environment LEAD_RETENTION_DAYS="${LEAD_RETENTION_DAYS}" \
  --environment MAX_TELEGRAM_ATTEMPTS="${MAX_TELEGRAM_ATTEMPTS}" \
  --environment YDB_QUERY_TIMEOUT_MS="${YDB_QUERY_TIMEOUT_MS}" \
  --environment YDB_SLOW_OPERATION_MS="${YDB_SLOW_OPERATION_MS}" \
  --environment YDB_SESSION_POOL_SIZE="${YDB_SESSION_POOL_SIZE}" \
  --environment LOG_LEVEL="${LOG_LEVEL}"

yc serverless function allow-unauthenticated-invoke "${FUNCTION_NAME}"

if yc serverless trigger get --name="${TRIGGER_NAME}" >/dev/null 2>&1; then
  yc serverless trigger update timer \
    --name="${TRIGGER_NAME}" \
    --new-cron-expression='* * * * ? *' \
    --new-payload='retry-telegram' \
    --new-invoke-function-name="${FUNCTION_NAME}" \
    --new-invoke-function-service-account-id="${YC_LEAD_SERVICE_ACCOUNT_ID}" \
    --new-function-retry-attempts=2 \
    --new-function-retry-interval=30s
else
  yc serverless trigger create timer \
    --name="${TRIGGER_NAME}" \
    --description="Retry pending ZvenFit lead notifications" \
    --cron-expression='* * * * ? *' \
    --payload='retry-telegram' \
    --invoke-function-name="${FUNCTION_NAME}" \
    --invoke-function-service-account-id="${YC_LEAD_SERVICE_ACCOUNT_ID}" \
    --retry-attempts=2 \
    --retry-interval=30s
fi

INVOKE_URL="$(yc serverless function get --name="${FUNCTION_NAME}" --format=json | node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
const url = data.http_invoke_url || '';
process.stdout.write(url);
")"

if [[ -z "${INVOKE_URL}" ]]; then
  echo "deploy-telegram-lead: function deployed, but http_invoke_url is empty" >&2
  echo "deploy-telegram-lead: check function HTTP invoke in YC console" >&2
  exit 0
fi

echo "deploy-telegram-lead: OK"
echo "YDB_DATABASE_NAME=${YDB_DATABASE_NAME}"
echo "LEAD_RETRY_TRIGGER=${TRIGGER_NAME}"
echo "LEAD_API_URL=${INVOKE_URL}"
echo "Add LEAD_API_URL to GitHub Actions secrets and rebuild the site."
