#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$(mktemp -d /tmp/zvenfit-site-traffic.XXXXXX)"
trap 'rm -rf -- "${SOURCE_DIR}"' EXIT
FUNCTION_NAME="${YC_TRAFFIC_FUNCTION_NAME:-zvenfit-site-traffic}"
RUNTIME="${YC_TRAFFIC_RUNTIME:-nodejs22}"
MEMORY="${YC_TRAFFIC_MEMORY:-128m}"
TIMEOUT="${YC_TRAFFIC_TIMEOUT:-3s}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://zvenfit.ru,https://www.zvenfit.ru,https://zvenigorod.zvenfit.ru}"
LOG_LEVEL="${LOG_LEVEL:-info}"
DEPLOYMENT_ENVIRONMENT_VALUE="${DEPLOYMENT_ENVIRONMENT:-}"
FUNCTION_INVOKER_MODE="${FUNCTION_INVOKER_MODE:-public}"
GATEWAY_SERVICE_ACCOUNT_ID="${YC_GATEWAY_SERVICE_ACCOUNT_ID:-}"

case "${DEPLOYMENT_ENVIRONMENT_VALUE}" in
  production | staging) ;;
  *)
    echo "deploy-site-traffic: DEPLOYMENT_ENVIRONMENT must be production or staging" >&2
    exit 1
    ;;
esac

if [[ "${FUNCTION_INVOKER_MODE}" != "public" && "${FUNCTION_INVOKER_MODE}" != "gateway" ]]; then
  echo "deploy-site-traffic: FUNCTION_INVOKER_MODE must be public or gateway" >&2
  exit 1
fi
if [[ "${DEPLOYMENT_ENVIRONMENT_VALUE}" == "production" && "${FUNCTION_INVOKER_MODE}" != "public" ]]; then
  echo "deploy-site-traffic: production must use public invoker mode" >&2
  exit 1
fi
if [[ "${DEPLOYMENT_ENVIRONMENT_VALUE}" == "staging" && "${FUNCTION_INVOKER_MODE}" != "gateway" ]]; then
  echo "deploy-site-traffic: staging must use gateway invoker mode" >&2
  exit 1
fi
if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" && -z "${GATEWAY_SERVICE_ACCOUNT_ID}" ]]; then
  echo "deploy-site-traffic: YC_GATEWAY_SERVICE_ACCOUNT_ID is required for gateway mode" >&2
  exit 1
fi
if ! command -v yc >/dev/null 2>&1; then
  echo "deploy-site-traffic: install Yandex Cloud CLI (yc)" >&2
  exit 1
fi
if [[ -z "${YC_FOLDER_ID:-}" ]]; then
  echo "deploy-site-traffic: set YC_FOLDER_ID" >&2
  exit 1
fi

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null
npm --prefix "${ROOT_DIR}/functions/site-traffic" run build
cp -R "${ROOT_DIR}/functions/site-traffic/build/." "${SOURCE_DIR}/"
cp \
  "${ROOT_DIR}/functions/site-traffic/package.json" \
  "${ROOT_DIR}/functions/site-traffic/package-lock.json" \
  "${SOURCE_DIR}/"
npm pkg delete devDependencies --prefix "${SOURCE_DIR}"

if ! yc serverless function get --name="${FUNCTION_NAME}" >/dev/null 2>&1; then
  if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" ]]; then
    echo "deploy-site-traffic: ${FUNCTION_NAME} must be provisioned before private gateway deploy" >&2
    exit 1
  fi
  yc serverless function create --name="${FUNCTION_NAME}"
fi

if ! yc serverless function list-access-bindings --name="${FUNCTION_NAME}" --format=json |
  node "${ROOT_DIR}/scripts/verify-function-invoker.cjs" "${FUNCTION_INVOKER_MODE}" "${GATEWAY_SERVICE_ACCOUNT_ID}"; then
  echo "deploy-site-traffic: ${FUNCTION_NAME} has an invalid ${FUNCTION_INVOKER_MODE} functionInvoker policy" >&2
  echo "Provision the required binding with an admin identity before deploy" >&2
  exit 1
fi

VERSION_TAG_ARGS=()
if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" ]]; then
  VERSION_TAG_ARGS+=(--tags=staging-live)
fi

yc serverless function version create \
  --function-name="${FUNCTION_NAME}" \
  --runtime="${RUNTIME}" \
  --entrypoint="index.handler" \
  --memory="${MEMORY}" \
  --execution-timeout="${TIMEOUT}" \
  --source-path="${SOURCE_DIR}" \
  "${VERSION_TAG_ARGS[@]}" \
  --environment "DEPLOYMENT_ENVIRONMENT=${DEPLOYMENT_ENVIRONMENT_VALUE}" \
  --environment "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" \
  --environment "LOG_LEVEL=${LOG_LEVEL}" \
  --environment "NODE_ENV=${DEPLOYMENT_ENVIRONMENT_VALUE}"

INVOKE_URL="$(yc serverless function get --name="${FUNCTION_NAME}" --format=json | node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(data.http_invoke_url || '');
")"

if [[ -z "${INVOKE_URL}" ]]; then
  echo "deploy-site-traffic: function deployed, but http_invoke_url is empty" >&2
  exit 1
fi
if [[ "${FUNCTION_INVOKER_MODE}" == "gateway" ]]; then
  node "${ROOT_DIR}/scripts/assert-private-http.cjs" "${INVOKE_URL}"
fi

echo "deploy-site-traffic: OK"
echo "TRAFFIC_API_URL=${INVOKE_URL}"
