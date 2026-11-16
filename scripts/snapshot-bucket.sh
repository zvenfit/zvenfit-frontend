#!/usr/bin/env bash
# Read-only copy of an Object Storage bucket into a directory outside the
# repository. The owner takes it before a release that replaces what the bucket
# serves (release A of the Astro migration: docs/astro-migration.md, stage 0 and
# section 9), instead of switching bucket versioning on. Nothing is written to
# the bucket and nothing is deleted from it: the bucket is only listed and read.
#
#   scripts/snapshot-bucket.sh <directory outside the repository> [--dry-run]
#
# The snapshot lands in <directory>/<bucket>-<UTC time>/: the objects under
# objects/ and the listing the copy was verified against (keys, sizes, ETags)
# next to them. --dry-run only prints what would be downloaded.
#
# Environment:
#   SNAPSHOT_BUCKET    bucket to copy, default zvenfit-frontend
#   SNAPSHOT_TOOL      aws (default) or yc
#   SNAPSHOT_ENDPOINT  S3 endpoint for aws, default https://storage.yandexcloud.net
#   AWS_REGION         region for aws, default ru-central1
#
# Credentials are those of the tool: the AWS CLI credential chain (AWS_PROFILE
# or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and, for a temporary key,
# AWS_SESSION_TOKEN) or the active `yc` profile. The script neither reads nor
# prints them. Usage notes: knowledge-base/staging-runbook.md.
set -euo pipefail

fail() {
  echo "snapshot-bucket: $*" >&2
  exit 1
}

usage() {
  echo 'usage: scripts/snapshot-bucket.sh <directory outside the repository> [--dry-run]' >&2
  exit 2
}

TARGET=''
DRY_RUN=0
for argument in "$@"; do
  case "${argument}" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help) usage ;;
    -*) usage ;;
    *)
      [[ -z "${TARGET}" ]] || usage
      TARGET="${argument}"
      ;;
  esac
done
[[ -n "${TARGET}" ]] || usage

BUCKET="${SNAPSHOT_BUCKET:-zvenfit-frontend}"
TOOL="${SNAPSHOT_TOOL:-aws}"
ENDPOINT="${SNAPSHOT_ENDPOINT:-https://storage.yandexcloud.net}"
REGION="${AWS_REGION:-ru-central1}"

[[ "${BUCKET}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || fail 'SNAPSHOT_BUCKET is not a bucket name'
case "${TOOL}" in
  aws | yc) ;;
  *) fail 'SNAPSHOT_TOOL must be aws or yc' ;;
esac
command -v "${TOOL}" > /dev/null 2>&1 ||
  fail "${TOOL} is not installed or not in PATH (the other tool: SNAPSHOT_TOOL=aws or SNAPSHOT_TOOL=yc)"
command -v node > /dev/null 2>&1 || fail 'node is required to verify the snapshot'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# The physical path of the target: its nearest existing ancestor resolved
# through symlinks, the rest appended as written.
while [[ "${TARGET}" != '/' && "${TARGET}" == */ ]]; do
  TARGET="${TARGET%/}"
done
[[ "${TARGET}" == /* ]] || TARGET="${PWD}/${TARGET}"
EXISTING="${TARGET}"
while [[ ! -d "${EXISTING}" ]]; do
  EXISTING="$(dirname "${EXISTING}")"
done
MISSING="${TARGET#"${EXISTING}"}"
case "${MISSING}/" in
  */../*) fail 'the part of the target that does not exist yet must not contain ".."' ;;
esac
EXISTING_REAL="$(cd "${EXISTING}" && pwd -P)"
TARGET_REAL="${EXISTING_REAL%/}${MISSING}"

# A snapshot inside a checkout would end up in a commit or in a build. Both the
# checkout that holds this script and, for a linked worktree, the main checkout
# are refused.
REPOSITORY_ROOTS=("$(cd "${SCRIPT_DIR}/.." && pwd -P)")
if COMMON_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --path-format=absolute --git-common-dir 2> /dev/null)"; then
  REPOSITORY_ROOTS+=("$(cd "$(dirname "${COMMON_DIR}")" && pwd -P)")
fi
for root in "${REPOSITORY_ROOTS[@]}"; do
  case "${TARGET_REAL}/" in
    "${root}"/*) fail "the target is inside the repository (${root}); choose a directory outside it" ;;
  esac
done

DESTINATION="${TARGET_REAL%/}/${BUCKET}-$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e "${DESTINATION}" ]] || fail "${DESTINATION} already exists"

download() {
  if [[ "${TOOL}" == aws ]]; then
    aws s3 sync "s3://${BUCKET}" "${DESTINATION}/objects" \
      --endpoint-url "${ENDPOINT}" --region "${REGION}" --no-progress "$@"
  else
    yc storage s3 cp --recursive "s3://${BUCKET}/" "${DESTINATION}/objects/" "$@"
  fi
}

if [[ "${DRY_RUN}" == 1 ]]; then
  echo "snapshot-bucket: dry run with ${TOOL}, nothing is downloaded; the snapshot would land in ${DESTINATION}"
  download --dryrun
  exit 0
fi

mkdir -p "${DESTINATION}/objects"
echo "snapshot-bucket: copying s3://${BUCKET} to ${DESTINATION}/objects with ${TOOL}"
download

# The listing is taken after the copy and kept next to it: the copy is verified
# against it, and it records the ETag and the modification time of every object.
if [[ "${TOOL}" == aws ]]; then
  aws s3api list-objects-v2 --bucket "${BUCKET}" \
    --endpoint-url "${ENDPOINT}" --region "${REGION}" --output json > "${DESTINATION}/listing-0001.json"
else
  PAGE=1
  TOKEN=''
  while :; do
    PAGE_FILE="${DESTINATION}/listing-$(printf '%04d' "${PAGE}").json"
    if [[ -n "${TOKEN}" ]]; then
      yc storage s3api list-objects --bucket "${BUCKET}" --continuation-token "${TOKEN}" --format json > "${PAGE_FILE}"
    else
      yc storage s3api list-objects --bucket "${BUCKET}" --format json > "${PAGE_FILE}"
    fi
    TOKEN="$(node "${SCRIPT_DIR}/lib/bucket-snapshot.cjs" next-token "${PAGE_FILE}")"
    [[ -n "${TOKEN}" ]] || break
    PAGE=$((PAGE + 1))
    [[ "${PAGE}" -le 1000 ]] || fail 'the listing did not end after 1000 pages'
  done
fi

node "${SCRIPT_DIR}/lib/bucket-snapshot.cjs" verify "${DESTINATION}/objects" "${DESTINATION}"/listing-*.json
echo "snapshot-bucket: done, ${DESTINATION}"
