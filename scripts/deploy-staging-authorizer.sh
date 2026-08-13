#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$(mktemp -d /tmp/zvenfit-staging-authorizer.XXXXXX)"
trap 'rm -rf -- "${SOURCE_DIR}"' EXIT

FUNCTION_NAME="${YC_STAGING_AUTHORIZER_FUNCTION_NAME:-zvenfit-staging-authorizer}"
GATEWAY_SERVICE_ACCOUNT_ID="${YC_GATEWAY_SERVICE_ACCOUNT_ID:-}"
RUNTIME="${YC_STAGING_AUTHORIZER_RUNTIME:-nodejs22}"
MEMORY="${YC_STAGING_AUTHORIZER_MEMORY:-128m}"
TIMEOUT="${YC_STAGING_AUTHORIZER_TIMEOUT:-3s}"

if [[ "${DEPLOYMENT_ENVIRONMENT:-}" != "staging" ]]; then
  echo "deploy-staging-authorizer: DEPLOYMENT_ENVIRONMENT must be staging" >&2
  exit 1
fi

if [[ -z "${YC_FOLDER_ID:-}" || -z "${GATEWAY_SERVICE_ACCOUNT_ID}" ]]; then
  echo "deploy-staging-authorizer: YC_FOLDER_ID and YC_GATEWAY_SERVICE_ACCOUNT_ID are required" >&2
  exit 1
fi

if [[ -z "${STAGING_BASIC_AUTH_USERNAME:-}" || -z "${STAGING_BASIC_AUTH_PASSWORD:-}" ]]; then
  echo "deploy-staging-authorizer: staging Basic Auth credentials are required" >&2
  exit 1
fi

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null

if ! yc serverless function get --name="${FUNCTION_NAME}" >/dev/null 2>&1; then
  echo "deploy-staging-authorizer: ${FUNCTION_NAME} must be provisioned before CI deploy" >&2
  exit 1
fi

if ! yc serverless function list-access-bindings --name="${FUNCTION_NAME}" --format=json |
  node "${ROOT_DIR}/scripts/verify-function-invoker.cjs" gateway "${GATEWAY_SERVICE_ACCOUNT_ID}"; then
  echo "deploy-staging-authorizer: ${FUNCTION_NAME} must be private and invokable only by the gateway service account" >&2
  exit 1
fi

npm --prefix "${ROOT_DIR}/functions/staging-authorizer" run build

cp -R "${ROOT_DIR}/functions/staging-authorizer/build/." "${SOURCE_DIR}/"
cp \
  "${ROOT_DIR}/functions/staging-authorizer/package.json" \
  "${ROOT_DIR}/functions/staging-authorizer/package-lock.json" \
  "${SOURCE_DIR}/"
npm pkg delete devDependencies --prefix "${SOURCE_DIR}"

CREDENTIAL_SHA256="$(node "${ROOT_DIR}/scripts/hash-staging-basic-auth.cjs")"

yc serverless function version create \
  --function-name="${FUNCTION_NAME}" \
  --runtime="${RUNTIME}" \
  --entrypoint=index.handler \
  --memory="${MEMORY}" \
  --execution-timeout="${TIMEOUT}" \
  --source-path="${SOURCE_DIR}" \
  --environment BASIC_AUTH_CREDENTIAL_SHA256="${CREDENTIAL_SHA256}" \
  --environment NODE_ENV=staging

unset CREDENTIAL_SHA256
echo "deploy-staging-authorizer: OK"
