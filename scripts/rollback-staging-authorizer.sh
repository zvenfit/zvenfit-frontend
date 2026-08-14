#!/usr/bin/env bash
set -euo pipefail

if [[ "${DEPLOYMENT_ENVIRONMENT:-}" != 'staging' ]]; then
  echo 'rollback-staging-authorizer: DEPLOYMENT_ENVIRONMENT must be staging' >&2
  exit 1
fi
if [[ -z "${CANDIDATE_VERSION_ID:-}" ]]; then
  echo 'rollback-staging-authorizer: CANDIDATE_VERSION_ID is required' >&2
  exit 1
fi

if [[ -n "${PREVIOUS_VERSION_ID:-}" ]]; then
  yc serverless function version set-tag --id="${PREVIOUS_VERSION_ID}" --tag=staging-live >/dev/null
  echo "rollback-staging-authorizer: restored ${PREVIOUS_VERSION_ID}"
else
  yc serverless function version remove-tag --id="${CANDIDATE_VERSION_ID}" --tag=staging-live >/dev/null
  echo 'rollback-staging-authorizer: removed staging-live from the first failed deployment'
fi
