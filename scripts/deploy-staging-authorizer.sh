#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$(mktemp -d /tmp/zvenfit-staging-authorizer.XXXXXX)"
CORRECT_EVENT="$(mktemp /tmp/zvenfit-staging-authorizer-correct.XXXXXX.json)"
WRONG_EVENT="$(mktemp /tmp/zvenfit-staging-authorizer-wrong.XXXXXX.json)"
trap 'rm -rf -- "${SOURCE_DIR}"; rm -f -- "${CORRECT_EVENT}" "${WRONG_EVENT}"' EXIT

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

PREVIOUS_VERSION_ID=''
if PREVIOUS_VERSION_JSON="$(yc serverless function version get-by-tag \
  --function-name="${FUNCTION_NAME}" \
  --tag=staging-live \
  --format=json 2>/dev/null)"; then
  PREVIOUS_VERSION_ID="$(node -e '
const version = JSON.parse(process.argv[1]);
process.stdout.write(version.id || "");
' "${PREVIOUS_VERSION_JSON}")"
fi

CANDIDATE_VERSION_JSON="$(yc serverless function version create \
  --function-name="${FUNCTION_NAME}" \
  --runtime="${RUNTIME}" \
  --entrypoint=index.handler \
  --memory="${MEMORY}" \
  --execution-timeout="${TIMEOUT}" \
  --source-path="${SOURCE_DIR}" \
  --environment BASIC_AUTH_CREDENTIAL_SHA256="${CREDENTIAL_SHA256}" \
  --environment NODE_ENV=staging \
  --format=json)"
CANDIDATE_VERSION_ID="$(node -e '
const version = JSON.parse(process.argv[1]);
if (!version.id) process.exit(1);
process.stdout.write(version.id);
' "${CANDIDATE_VERSION_JSON}")"

yc serverless function version set-tag --id="${CANDIDATE_VERSION_ID}" --tag=staging-candidate >/dev/null

node -e '
const fs = require("node:fs");
const correct = `Basic ${Buffer.from(`${process.env.STAGING_BASIC_AUTH_USERNAME}:${process.env.STAGING_BASIC_AUTH_PASSWORD}`).toString("base64")}`;
const wrong = `Basic ${Buffer.from("zvenfit-smoke:deliberately-wrong-credentials").toString("base64")}`;
fs.writeFileSync(process.argv[1], JSON.stringify({ headers: { Authorization: correct } }), { mode: 0o600 });
fs.writeFileSync(process.argv[2], JSON.stringify({ headers: { Authorization: wrong } }), { mode: 0o600 });
' "${CORRECT_EVENT}" "${WRONG_EVENT}"
unset CREDENTIAL_SHA256 CANDIDATE_VERSION_JSON PREVIOUS_VERSION_JSON

yc serverless function invoke \
  --name="${FUNCTION_NAME}" \
  --tag=staging-candidate \
  --data-file="${CORRECT_EVENT}" |
  node "${ROOT_DIR}/scripts/verify-authorizer-result.cjs" true
yc serverless function invoke \
  --name="${FUNCTION_NAME}" \
  --tag=staging-candidate \
  --data-file="${WRONG_EVENT}" |
  node "${ROOT_DIR}/scripts/verify-authorizer-result.cjs" false

yc serverless function version set-tag --id="${CANDIDATE_VERSION_ID}" --tag=staging-live >/dev/null

INVOKE_URL="$(yc serverless function get --name="${FUNCTION_NAME}" --format=json | node -e '
const fs = require("node:fs");
const fn = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(fn.http_invoke_url || "");
')"
if [[ -z "${INVOKE_URL}" ]]; then
  echo 'deploy-staging-authorizer: http_invoke_url is empty' >&2
  exit 1
fi
node "${ROOT_DIR}/scripts/assert-private-http.cjs" "${INVOKE_URL}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'previous_version_id=%s\n' "${PREVIOUS_VERSION_ID}"
    printf 'candidate_version_id=%s\n' "${CANDIDATE_VERSION_ID}"
  } >> "${GITHUB_OUTPUT}"
fi

echo "deploy-staging-authorizer: OK"
