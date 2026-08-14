#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$(mktemp -d /tmp/zvenfit-cdn-analytics.XXXXXX)"
trap 'rm -rf -- "${SOURCE_DIR}"' EXIT

FUNCTION_NAME="${YC_CDN_ANALYTICS_FUNCTION_NAME:-zvenfit-cdn-analytics}"
TRIGGER_NAME="${YC_CDN_ANALYTICS_TRIGGER_NAME:-zvenfit-cdn-analytics-objects}"
SERVICE_ACCOUNT_NAME="${YC_CDN_ANALYTICS_SA_NAME:-zvenfit-cdn-analytics-runtime}"
LOCKBOX_SECRET_NAME="${YC_CDN_ANALYTICS_SECRET_NAME:-zvenfit-cdn-session-hmac}"
BUCKET_NAME="${YC_CDN_ANALYTICS_BUCKET:-zvenfit-cdn-access-logs}"
CDN_RESOURCE_ID="${YC_CDN_RESOURCE_ID:-bc8rubabuwzpqqp7rifz}"
CDN_LOG_PREFIX="${YC_CDN_LOG_PREFIX:-raw/zvenfit/}"
SESSION_STATE_PREFIX="${YC_CDN_SESSION_STATE_PREFIX:-state/sessions/}"
SITE_HOSTS="${YC_CDN_SITE_HOSTS:-zvenfit.ru,www.zvenfit.ru,zvenigorod.zvenfit.ru}"
RUNTIME="${YC_CDN_ANALYTICS_RUNTIME:-nodejs22}"
MEMORY="${YC_CDN_ANALYTICS_MEMORY:-256m}"
TIMEOUT="${YC_CDN_ANALYTICS_TIMEOUT:-120s}"

if ! command -v yc >/dev/null 2>&1; then
  echo "deploy-cdn-analytics: install Yandex Cloud CLI (yc)" >&2
  exit 1
fi

if [[ -z "${YC_FOLDER_ID:-}" ]]; then
  echo "deploy-cdn-analytics: set YC_FOLDER_ID" >&2
  exit 1
fi

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null

if ! yc storage bucket get --name="${BUCKET_NAME}" >/dev/null 2>&1; then
  echo "deploy-cdn-analytics: bucket ${BUCKET_NAME} is not provisioned" >&2
  exit 1
fi

SERVICE_ACCOUNT_ID="$(yc iam service-account get --name="${SERVICE_ACCOUNT_NAME}" --format=json | node -e '
const fs = require("fs");
process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).id || "");
')"
if [[ -z "${SERVICE_ACCOUNT_ID}" ]]; then
  echo "deploy-cdn-analytics: service account ${SERVICE_ACCOUNT_NAME} is not provisioned" >&2
  exit 1
fi

if ! yc lockbox secret get --name="${LOCKBOX_SECRET_NAME}" >/dev/null 2>&1; then
  echo "deploy-cdn-analytics: Lockbox secret ${LOCKBOX_SECRET_NAME} is not provisioned" >&2
  exit 1
fi

npm --prefix "${ROOT_DIR}/functions/cdn-analytics" run test

cp -R "${ROOT_DIR}/functions/cdn-analytics/build/." "${SOURCE_DIR}/"
cp \
  "${ROOT_DIR}/functions/cdn-analytics/package.json" \
  "${ROOT_DIR}/functions/cdn-analytics/package-lock.json" \
  "${SOURCE_DIR}/"
npm pkg delete devDependencies --prefix "${SOURCE_DIR}"

if ! yc serverless function get --name="${FUNCTION_NAME}" >/dev/null 2>&1; then
  yc serverless function create \
    --name="${FUNCTION_NAME}" \
    --description="Classify ZvenFit CDN traffic and publish privacy-safe technical metrics"
fi

if ! yc serverless function list-access-bindings --name="${FUNCTION_NAME}" --format=json | \
  SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_ID}" node -e '
const fs = require("fs");
const bindings = JSON.parse(fs.readFileSync(0, "utf8"));
const serviceAccountId = process.env.SERVICE_ACCOUNT_ID;
process.exit(bindings.some(binding =>
  binding.role_id === "functions.functionInvoker" &&
  binding.subject?.type === "serviceAccount" &&
  binding.subject?.id === serviceAccountId
) ? 0 : 1);
'; then
  yc serverless function add-access-binding \
    --name="${FUNCTION_NAME}" \
    --role=functions.functionInvoker \
    --service-account-id="${SERVICE_ACCOUNT_ID}" >/dev/null
fi

yc serverless function version create \
  --function-name="${FUNCTION_NAME}" \
  --runtime="${RUNTIME}" \
  --entrypoint=index.handler \
  --memory="${MEMORY}" \
  --execution-timeout="${TIMEOUT}" \
  --concurrency=1 \
  --min-log-level=info \
  --source-path="${SOURCE_DIR}" \
  --service-account-id="${SERVICE_ACCOUNT_ID}" \
  --secret "environment-variable=SESSION_HASH_SECRET,name=${LOCKBOX_SECRET_NAME},key=session-hmac-key" \
  --environment "YC_FOLDER_ID=${YC_FOLDER_ID}" \
  --environment "CDN_RESOURCE_ID=${CDN_RESOURCE_ID}" \
  --environment "CDN_LOG_PREFIX=${CDN_LOG_PREFIX}" \
  --environment "SESSION_STATE_PREFIX=${SESSION_STATE_PREFIX}" \
  --environment "SESSION_TIMEOUT_MINUTES=30" \
  --environment "SUSPICIOUS_REQUESTS_PER_BATCH=100" \
  --environment "MAX_OBJECT_BYTES=20971520" \
  --environment "SITE_HOSTS=${SITE_HOSTS}" \
  --environment "NODE_ENV=production"

if yc serverless trigger get --name="${TRIGGER_NAME}" >/dev/null 2>&1; then
  TRIGGER_ID="$(yc serverless trigger get --name="${TRIGGER_NAME}" --format=json | node -e '
const fs = require("fs");
process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).id || "");
')"
  yc serverless trigger update object-storage \
    --id="${TRIGGER_ID}" \
    --description="Process new ZvenFit CDN raw log objects" \
    --new-bucket-id="${BUCKET_NAME}" \
    --new-prefix="${CDN_LOG_PREFIX}" \
    --new-events=create-object \
    --new-batch-size=10 \
    --new-batch-cutoff=60s \
    --new-invoke-function-name="${FUNCTION_NAME}" \
    --new-invoke-function-service-account-id="${SERVICE_ACCOUNT_ID}" \
    --new-function-retry-attempts=3 \
    --new-function-retry-interval=30s
else
  yc serverless trigger create object-storage \
    --name="${TRIGGER_NAME}" \
    --description="Process new ZvenFit CDN raw log objects" \
    --bucket-id="${BUCKET_NAME}" \
    --prefix="${CDN_LOG_PREFIX}" \
    --events=create-object \
    --batch-size=10 \
    --batch-cutoff=60s \
    --invoke-function-name="${FUNCTION_NAME}" \
    --invoke-function-service-account-id="${SERVICE_ACCOUNT_ID}" \
    --retry-attempts=3 \
    --retry-interval=30s
fi

echo "deploy-cdn-analytics: OK"
echo "CDN_ANALYTICS_FUNCTION=${FUNCTION_NAME}"
echo "CDN_ANALYTICS_TRIGGER=${TRIGGER_NAME}"
