#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$(mktemp -d /tmp/zvenfit-schedule.XXXXXX)"
trap 'rm -rf -- "${SOURCE_DIR}"' EXIT
FUNCTION_NAME="${YC_SCHEDULE_FUNCTION_NAME:-zvenfit-fitbase-schedule}"
RUNTIME="${YC_SCHEDULE_RUNTIME:-nodejs22}"
MEMORY="${YC_SCHEDULE_MEMORY:-128m}"
TIMEOUT="${YC_SCHEDULE_TIMEOUT:-15s}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://zvenfit.ru,https://www.zvenfit.ru,https://zvenigorod.zvenfit.ru}"
FITBASE_DOMAIN="${FITBASE_DOMAIN:-zvenfit}"
LOG_LEVEL="${LOG_LEVEL:-info}"
NODE_ENV_VALUE="${NODE_ENV:-production}"
DEPLOYMENT_ENVIRONMENT_VALUE="${DEPLOYMENT_ENVIRONMENT:-${NODE_ENV_VALUE}}"
SCHEDULE_PROVIDER="${SCHEDULE_PROVIDER:-fitbase}"
FUNCTION_INVOKER_MODE="${FUNCTION_INVOKER_MODE:-public}"
GATEWAY_SERVICE_ACCOUNT_ID="${YC_GATEWAY_SERVICE_ACCOUNT_ID:-}"

case "${SCHEDULE_PROVIDER}" in
  fitbase | fixture) ;;
  *)
    echo "deploy-fitbase-schedule: SCHEDULE_PROVIDER must be fitbase or fixture" >&2
    exit 1
    ;;
esac

if [[ "${FUNCTION_INVOKER_MODE}" != "public" && "${FUNCTION_INVOKER_MODE}" != "gateway" ]]; then
  echo "deploy-fitbase-schedule: FUNCTION_INVOKER_MODE must be public or gateway" >&2
  exit 1
fi

if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" && -z "${GATEWAY_SERVICE_ACCOUNT_ID}" ]]; then
  echo "deploy-fitbase-schedule: YC_GATEWAY_SERVICE_ACCOUNT_ID is required for gateway mode" >&2
  exit 1
fi

if [[ "${SCHEDULE_PROVIDER}" == "fixture" ]] &&
  { [[ "${NODE_ENV_VALUE}" == "production" ]] || [[ "${DEPLOYMENT_ENVIRONMENT_VALUE}" == "production" ]]; }; then
  echo "deploy-fitbase-schedule: fixture provider is forbidden in production" >&2
  exit 1
fi

if [[ "${SCHEDULE_PROVIDER}" == "fitbase" ]] && [[ -z "${FITBASE_API_TOKEN:-}" ]]; then
  echo "deploy-fitbase-schedule: set FITBASE_API_TOKEN for the fitbase provider" >&2
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

npm --prefix "${ROOT_DIR}/functions/fitbase-schedule" run build

cp -R "${ROOT_DIR}/functions/fitbase-schedule/build/." "${SOURCE_DIR}/"
cp \
  "${ROOT_DIR}/functions/fitbase-schedule/package.json" \
  "${ROOT_DIR}/functions/fitbase-schedule/package-lock.json" \
  "${SOURCE_DIR}/"

npm pkg delete devDependencies --prefix "${SOURCE_DIR}"

if ! yc serverless function get --name="${FUNCTION_NAME}" >/dev/null 2>&1; then
  if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" ]]; then
    echo "deploy-fitbase-schedule: ${FUNCTION_NAME} must be provisioned before private gateway deploy" >&2
    exit 1
  fi
  yc serverless function create --name="${FUNCTION_NAME}"
fi

if ! yc serverless function list-access-bindings --name="${FUNCTION_NAME}" --format=json |
  node "${ROOT_DIR}/scripts/verify-function-invoker.cjs" "${FUNCTION_INVOKER_MODE}" "${GATEWAY_SERVICE_ACCOUNT_ID}"; then
  echo "deploy-fitbase-schedule: ${FUNCTION_NAME} has an invalid ${FUNCTION_INVOKER_MODE} functionInvoker policy" >&2
  echo "Provision the required binding with an admin identity before deploy" >&2
  exit 1
fi

ENV_ARGS=(
  --environment "SCHEDULE_PROVIDER=${SCHEDULE_PROVIDER}"
  --environment "DEPLOYMENT_ENVIRONMENT=${DEPLOYMENT_ENVIRONMENT_VALUE}"
  --environment "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"
  --environment "LOG_LEVEL=${LOG_LEVEL}"
  --environment "NODE_ENV=${NODE_ENV_VALUE}"
)

VERSION_TAG_ARGS=()
if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" ]]; then
  VERSION_TAG_ARGS+=(--tags=staging-live)
fi

if [[ "${SCHEDULE_PROVIDER}" == "fitbase" ]]; then
  ENV_ARGS+=(
    --environment "FITBASE_API_TOKEN=${FITBASE_API_TOKEN}"
    --environment "FITBASE_DOMAIN=${FITBASE_DOMAIN}"
  )

  if [[ -n "${FITBASE_CLUB_ID:-}" ]]; then
    ENV_ARGS+=(--environment "FITBASE_CLUB_ID=${FITBASE_CLUB_ID}")
  fi
fi

yc serverless function version create \
  --function-name="${FUNCTION_NAME}" \
  --runtime="${RUNTIME}" \
  --entrypoint=index.handler \
  --memory="${MEMORY}" \
  --execution-timeout="${TIMEOUT}" \
  --source-path="${SOURCE_DIR}" \
  "${VERSION_TAG_ARGS[@]}" \
  "${ENV_ARGS[@]}"

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

if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" ]]; then
  node "${ROOT_DIR}/scripts/assert-private-http.cjs" "${INVOKE_URL}"
fi

echo "deploy-fitbase-schedule: OK"
echo "SCHEDULE_API_URL=${INVOKE_URL}"
