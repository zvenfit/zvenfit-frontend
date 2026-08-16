#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC_FILE="$(mktemp /tmp/zvenfit-staging-gateway.XXXXXX.json)"
trap 'rm -f -- "${SPEC_FILE}"' EXIT

GATEWAY_NAME="${YC_STAGING_GATEWAY_NAME:-zvenfit-staging}"
GATEWAY_ID="${YC_STAGING_GATEWAY_ID:-}"
STAGING_BUCKET="${STAGING_BUCKET:-zvenfit-frontend-staging}"

if [[ "${DEPLOYMENT_ENVIRONMENT:-}" != "staging" ]]; then
  echo "deploy-staging-gateway: DEPLOYMENT_ENVIRONMENT must be staging" >&2
  exit 1
fi

for name in YC_FOLDER_ID YC_GATEWAY_SERVICE_ACCOUNT_ID STAGING_AUTHORIZER_FUNCTION_ID STAGING_LEAD_FUNCTION_ID STAGING_SCHEDULE_FUNCTION_ID STAGING_TRAFFIC_FUNCTION_ID STAGING_SWS_SECURITY_PROFILE_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "deploy-staging-gateway: ${name} is required" >&2
    exit 1
  fi
done

yc config set folder-id "${YC_FOLDER_ID}" >/dev/null

GATEWAY_REF_ARGS=(--name="${GATEWAY_NAME}")
if [[ -n "${GATEWAY_ID}" ]]; then
  GATEWAY_REF_ARGS=(--id="${GATEWAY_ID}")
fi

if ! yc serverless api-gateway get "${GATEWAY_REF_ARGS[@]}" >/dev/null 2>&1; then
  echo "deploy-staging-gateway: ${GATEWAY_NAME} must be provisioned and bound to staging.zvenfit.ru before CI deploy" >&2
  exit 1
fi

yc storage bucket get --name="${STAGING_BUCKET}" --format=json |
  node "${ROOT_DIR}/scripts/verify-storage-access.cjs" metadata

STAGING_BUCKET="${STAGING_BUCKET}" \
  node "${ROOT_DIR}/scripts/generate-staging-gateway-spec.cjs" \
  --dist "${ROOT_DIR}/dist" \
  --output "${SPEC_FILE}"

yc serverless api-gateway update \
  "${GATEWAY_REF_ARGS[@]}" \
  --spec="${SPEC_FILE}" \
  --description="Private authenticated ZvenFit staging gateway" \
  --min-log-level=info

echo "deploy-staging-gateway: OK"
