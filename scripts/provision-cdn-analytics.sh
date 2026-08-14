#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKET_NAME="${YC_CDN_ANALYTICS_BUCKET:-zvenfit-cdn-access-logs}"
SERVICE_ACCOUNT_NAME="${YC_CDN_ANALYTICS_SA_NAME:-zvenfit-cdn-analytics-runtime}"
LOCKBOX_SECRET_NAME="${YC_CDN_ANALYTICS_SECRET_NAME:-zvenfit-cdn-session-hmac}"
FUNCTION_NAME="${YC_CDN_ANALYTICS_FUNCTION_NAME:-zvenfit-cdn-analytics}"
CDN_RESOURCE_ID="${YC_CDN_RESOURCE_ID:-bc8rubabuwzpqqp7rifz}"
CDN_LOG_PREFIX="${YC_CDN_LOG_PREFIX:-raw/zvenfit/}"
CDN_EXPORT_PREFIX="${YC_CDN_EXPORT_PREFIX:-raw/zvenfit/cdn}"
BUCKET_MAX_SIZE="${YC_CDN_ANALYTICS_BUCKET_MAX_SIZE:-5368709120}"

for command in yc curl node openssl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "provision-cdn-analytics: ${command} is required" >&2
    exit 1
  fi
done

if [[ -z "${YC_FOLDER_ID:-}" ]]; then
  echo "provision-cdn-analytics: set YC_FOLDER_ID" >&2
  exit 1
fi

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null

if ! yc storage bucket get --name="${BUCKET_NAME}" >/dev/null 2>&1; then
  yc storage bucket create \
    --name="${BUCKET_NAME}" \
    --default-storage-class=STANDARD \
    --max-size="${BUCKET_MAX_SIZE}" >/dev/null
fi

yc storage bucket update \
  --name="${BUCKET_NAME}" \
  --max-size="${BUCKET_MAX_SIZE}" \
  --versioning=versioning-disabled \
  --lifecycle-rules-from-file="${ROOT_DIR}/scripts/cdn-access-logs.lifecycle.json" >/dev/null

if ! yc iam service-account get --name="${SERVICE_ACCOUNT_NAME}" >/dev/null 2>&1; then
  yc iam service-account create \
    --name="${SERVICE_ACCOUNT_NAME}" \
    --description="Runtime identity for privacy-safe ZvenFit CDN analytics" >/dev/null
fi

SERVICE_ACCOUNT_ID="$(yc iam service-account get --name="${SERVICE_ACCOUNT_NAME}" --format=json | node -e '
const fs = require("fs");
process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).id || "");
')"

yc resource-manager folder add-access-binding \
  --id="${YC_FOLDER_ID}" \
  --role=monitoring.editor \
  --service-account-id="${SERVICE_ACCOUNT_ID}" >/dev/null

IAM_TOKEN="$(yc iam create-token)"
BUCKET_RESOURCE_ID="$(curl --fail --silent --show-error \
  --header "Authorization: Bearer ${IAM_TOKEN}" \
  "https://storage.api.cloud.yandex.net/storage/v1/buckets?folderId=${YC_FOLDER_ID}" | \
  BUCKET_NAME="${BUCKET_NAME}" node -e '
const fs = require("fs");
const buckets = JSON.parse(fs.readFileSync(0, "utf8")).buckets || [];
const bucket = buckets.find(item => item.name === process.env.BUCKET_NAME);
process.stdout.write(bucket?.resourceId || "");
')"
if [[ -z "${BUCKET_RESOURCE_ID}" ]]; then
  echo "provision-cdn-analytics: failed to resolve resourceId for ${BUCKET_NAME}" >&2
  exit 1
fi
BUCKET_BINDINGS="$(curl --fail --silent --show-error \
  --header "Authorization: Bearer ${IAM_TOKEN}" \
  "https://storage.api.cloud.yandex.net/storage/v1/buckets/${BUCKET_RESOURCE_ID}:listAccessBindings")"
if ! printf '%s' "${BUCKET_BINDINGS}" | SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_ID}" node -e '
const fs = require("fs");
const bindings = JSON.parse(fs.readFileSync(0, "utf8")).accessBindings || [];
const serviceAccountId = process.env.SERVICE_ACCOUNT_ID;
process.exit(bindings.some(binding =>
  binding.roleId === "storage.editor" &&
  binding.subject?.type === "serviceAccount" &&
  binding.subject?.id === serviceAccountId
) ? 0 : 1);
'; then
  BINDING_PAYLOAD="$(printf '%s' "${BUCKET_BINDINGS}" | SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_ID}" node -e '
const fs = require("fs");
const accessBindings = JSON.parse(fs.readFileSync(0, "utf8")).accessBindings || [];
accessBindings.push({
    roleId: "storage.editor",
    subject: { id: process.env.SERVICE_ACCOUNT_ID, type: "serviceAccount" },
});
process.stdout.write(JSON.stringify({ accessBindings }));
')"
  BINDING_RESPONSE="$(curl --fail --silent --show-error \
    --request POST \
    --header "Authorization: Bearer ${IAM_TOKEN}" \
    --header 'Content-Type: application/json' \
    --data "${BINDING_PAYLOAD}" \
    "https://storage.api.cloud.yandex.net/storage/v1/buckets/${BUCKET_RESOURCE_ID}:setAccessBindings")"
  BINDING_OPERATION_ID="$(printf '%s' "${BINDING_RESPONSE}" | node -e '
const fs = require("fs");
process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).id || "");
')"
  if [[ -n "${BINDING_OPERATION_ID}" ]]; then
    yc operation wait "${BINDING_OPERATION_ID}" >/dev/null
  fi
fi
unset BUCKET_RESOURCE_ID BUCKET_BINDINGS BINDING_PAYLOAD BINDING_RESPONSE BINDING_OPERATION_ID

if ! yc lockbox secret get --name="${LOCKBOX_SECRET_NAME}" >/dev/null 2>&1; then
  SESSION_HASH_VALUE="$(openssl rand -hex 32)"
  printf '[{"key":"session-hmac-key","text_value":"%s"}]' "${SESSION_HASH_VALUE}" | \
    yc lockbox secret create \
      --name="${LOCKBOX_SECRET_NAME}" \
      --description="HMAC key for non-reversible ZvenFit CDN session identifiers" \
      --deletion-protection \
      --payload=- >/dev/null
  unset SESSION_HASH_VALUE
fi

yc lockbox secret add-access-binding \
  --name="${LOCKBOX_SECRET_NAME}" \
  --role=lockbox.payloadViewer \
  --service-account-id="${SERVICE_ACCOUNT_ID}" >/dev/null

if ! yc serverless function get --name="${FUNCTION_NAME}" >/dev/null 2>&1; then
  yc serverless function create \
    --name="${FUNCTION_NAME}" \
    --description="Classify ZvenFit CDN traffic and publish privacy-safe technical metrics" >/dev/null
fi

yc serverless function add-access-binding \
  --name="${FUNCTION_NAME}" \
  --role=functions.functionInvoker \
  --service-account-id="${SERVICE_ACCOUNT_ID}" >/dev/null

YC_CDN_ANALYTICS_BUCKET="${BUCKET_NAME}" \
YC_CDN_ANALYTICS_SA_NAME="${SERVICE_ACCOUNT_NAME}" \
YC_CDN_ANALYTICS_SECRET_NAME="${LOCKBOX_SECRET_NAME}" \
YC_CDN_ANALYTICS_FUNCTION_NAME="${FUNCTION_NAME}" \
YC_CDN_RESOURCE_ID="${CDN_RESOURCE_ID}" \
YC_CDN_LOG_PREFIX="${CDN_LOG_PREFIX}" \
bash "${ROOT_DIR}/scripts/deploy-cdn-analytics.sh"

RAW_LOGS_RESPONSE="$(curl --fail --silent --show-error \
  --header "Authorization: Bearer ${IAM_TOKEN}" \
  "https://cdn.api.cloud.yandex.net/cdn/v1/rawLogs/${CDN_RESOURCE_ID}")"
RAW_LOGS_STATUS="$(printf '%s' "${RAW_LOGS_RESPONSE}" | node -e '
const fs = require("fs");
process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).status || "");
')"

if [[ "${RAW_LOGS_STATUS}" == "RAW_LOGS_STATUS_NOT_ACTIVATED" ]]; then
  ACTIVATION_PAYLOAD="$(node -e '
const [resourceId, bucketName, filePrefix] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  resourceId,
  settings: { bucketName, bucketRegion: "", filePrefix },
}));
' "${CDN_RESOURCE_ID}" "${BUCKET_NAME}" "${CDN_EXPORT_PREFIX}")"
  ACTIVATION_RESPONSE="$(curl --fail --silent --show-error \
    --request POST \
    --header "Authorization: Bearer ${IAM_TOKEN}" \
    --header 'Content-Type: application/json' \
    --data "${ACTIVATION_PAYLOAD}" \
    'https://cdn.api.cloud.yandex.net/cdn/v1/rawLogs:activate')"
  ACTIVATION_OPERATION_ID="$(printf '%s' "${ACTIVATION_RESPONSE}" | node -e '
const fs = require("fs");
process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).id || "");
')"
  if [[ -n "${ACTIVATION_OPERATION_ID}" ]]; then
    yc operation wait "${ACTIVATION_OPERATION_ID}" >/dev/null
  fi
elif [[ "${RAW_LOGS_STATUS}" == "RAW_LOGS_STATUS_OK" || "${RAW_LOGS_STATUS}" == "RAW_LOGS_STATUS_PENDING" ]]; then
  if ! printf '%s' "${RAW_LOGS_RESPONSE}" | EXPECTED_BUCKET="${BUCKET_NAME}" EXPECTED_PREFIX="${CDN_EXPORT_PREFIX}" node -e '
const fs = require("fs");
const settings = JSON.parse(fs.readFileSync(0, "utf8")).settings || {};
process.exit(settings.bucketName === process.env.EXPECTED_BUCKET &&
  settings.filePrefix === process.env.EXPECTED_PREFIX ? 0 : 1);
'; then
    echo "provision-cdn-analytics: raw log export already targets different settings" >&2
    exit 1
  fi
elif [[ "${RAW_LOGS_STATUS}" == "RAW_LOGS_STATUS_FAILED" ]]; then
  echo "provision-cdn-analytics: CDN raw log export is in FAILED state" >&2
  exit 1
else
  echo "provision-cdn-analytics: unexpected raw log status ${RAW_LOGS_STATUS}" >&2
  exit 1
fi

for _ in {1..15}; do
  RAW_LOGS_RESPONSE="$(curl --fail --silent --show-error \
    --header "Authorization: Bearer ${IAM_TOKEN}" \
    "https://cdn.api.cloud.yandex.net/cdn/v1/rawLogs/${CDN_RESOURCE_ID}")"
  RAW_LOGS_STATUS="$(printf '%s' "${RAW_LOGS_RESPONSE}" | node -e '
const fs = require("fs");
process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).status || "");
')"
  [[ "${RAW_LOGS_STATUS}" == "RAW_LOGS_STATUS_OK" ]] && break
  if [[ "${RAW_LOGS_STATUS}" == "RAW_LOGS_STATUS_FAILED" ]]; then
    echo "provision-cdn-analytics: CDN raw log export entered FAILED state" >&2
    exit 1
  fi
  sleep 2
done

unset IAM_TOKEN RAW_LOGS_RESPONSE ACTIVATION_PAYLOAD ACTIVATION_RESPONSE ACTIVATION_OPERATION_ID

echo "provision-cdn-analytics: OK"
echo "CDN_RAW_LOGS_STATUS=${RAW_LOGS_STATUS}"
echo "CDN_RAW_LOGS_BUCKET=${BUCKET_NAME}"
echo "CDN_RAW_LOGS_RETENTION_DAYS=30"
