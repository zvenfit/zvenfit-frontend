#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKET_NAME="${YC_CDN_RAW_LOGS_BUCKET:-zvenfit-cdn-access-logs}"
CDN_RESOURCE_ID="${YC_CDN_RESOURCE_ID:-bc8rubabuwzpqqp7rifz}"
CDN_EXPORT_PREFIX="${YC_CDN_EXPORT_PREFIX:-raw/zvenfit/cdn}"
BUCKET_MAX_SIZE="${YC_CDN_RAW_LOGS_BUCKET_MAX_SIZE:-5368709120}"

for command in yc curl node; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "provision-cdn-raw-logs: ${command} is required" >&2
    exit 1
  fi
done

if [[ -z "${YC_FOLDER_ID:-}" ]]; then
  echo "provision-cdn-raw-logs: set YC_FOLDER_ID" >&2
  exit 1
fi

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null

if ! yc storage bucket get --name="${BUCKET_NAME}" >/dev/null 2>&1; then
  yc storage bucket create \
    --name="${BUCKET_NAME}" \
    --default-storage-class=STANDARD \
    --max-size="${BUCKET_MAX_SIZE}" >/dev/null
fi

if ! yc storage bucket get --name="${BUCKET_NAME}" --full --format=json | node -e '
const fs = require("fs");
const bucket = JSON.parse(fs.readFileSync(0, "utf8"));
const access = bucket.anonymous_access_flags || {};
process.exit(access.read === false && access.list === false && access.config_read === false ? 0 : 1);
'; then
  echo "provision-cdn-raw-logs: bucket ${BUCKET_NAME} must remain private" >&2
  exit 1
fi

yc storage bucket update \
  --name="${BUCKET_NAME}" \
  --max-size="${BUCKET_MAX_SIZE}" \
  --versioning=versioning-disabled \
  --lifecycle-rules-from-file="${ROOT_DIR}/scripts/cdn-access-logs.lifecycle.json" >/dev/null

IAM_TOKEN="$(yc iam create-token)"
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
    echo "provision-cdn-raw-logs: raw log export already targets different settings" >&2
    exit 1
  fi
elif [[ "${RAW_LOGS_STATUS}" == "RAW_LOGS_STATUS_FAILED" ]]; then
  echo "provision-cdn-raw-logs: CDN raw log export is in FAILED state" >&2
  exit 1
else
  echo "provision-cdn-raw-logs: unexpected raw log status ${RAW_LOGS_STATUS}" >&2
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
    echo "provision-cdn-raw-logs: CDN raw log export entered FAILED state" >&2
    exit 1
  fi
  sleep 2
done

if [[ "${RAW_LOGS_STATUS}" != "RAW_LOGS_STATUS_OK" ]]; then
  echo "provision-cdn-raw-logs: timed out waiting for active raw log export" >&2
  exit 1
fi

unset IAM_TOKEN RAW_LOGS_RESPONSE ACTIVATION_PAYLOAD ACTIVATION_RESPONSE ACTIVATION_OPERATION_ID

echo "provision-cdn-raw-logs: OK"
echo "CDN_RAW_LOGS_STATUS=${RAW_LOGS_STATUS}"
echo "CDN_RAW_LOGS_BUCKET=${BUCKET_NAME}"
echo "CDN_RAW_LOGS_RETENTION_DAYS=30"
