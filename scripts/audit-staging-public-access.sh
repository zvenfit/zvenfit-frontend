#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for name in YC_STAGING_FOLDER_ID YC_CLOUD_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "audit-staging-public-access: ${name} is required" >&2
    exit 1
  fi
done

yc resource-manager folder list-access-bindings --id "${YC_STAGING_FOLDER_ID}" --format json |
  node "${ROOT_DIR}/scripts/verify-no-public-iam.cjs"
yc resource-manager cloud list-access-bindings --id "${YC_CLOUD_ID}" --format json |
  node "${ROOT_DIR}/scripts/verify-no-public-iam.cjs"

echo 'audit-staging-public-access: parent scopes do not expose functions or storage publicly'
