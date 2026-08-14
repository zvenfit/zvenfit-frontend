#!/usr/bin/env bash
set -euo pipefail

for name in YC_DEPLOY_SERVICE_ACCOUNT_ID OBJECT_STORAGE_BUCKET GITHUB_ENV; do
  if [[ -z "${!name:-}" ]]; then
    echo "issue-ephemeral-storage-key: ${name} is required" >&2
    exit 1
  fi
done

if [[ ! "${OBJECT_STORAGE_BUCKET}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo 'issue-ephemeral-storage-key: OBJECT_STORAGE_BUCKET is invalid' >&2
  exit 1
fi

SESSION_POLICY="$(mktemp /tmp/zvenfit-storage-session-policy.XXXXXX.json)"
trap 'rm -f -- "${SESSION_POLICY}"' EXIT
SESSION_NAME="gha-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
node -e '
const fs = require("node:fs");
const bucket = process.argv[2];
const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["s3:GetBucketAcl", "s3:GetBucketPolicy", "s3:ListBucket"],
      Resource: [`arn:aws:s3:::${bucket}`],
    },
    {
      Effect: "Allow",
      Action: ["s3:DeleteObject", "s3:GetObjectAcl", "s3:PutObject"],
      Resource: [`arn:aws:s3:::${bucket}/*`],
    },
  ],
};
fs.writeFileSync(process.argv[1], JSON.stringify(policy), { mode: 0o600 });
' "${SESSION_POLICY}" "${OBJECT_STORAGE_BUCKET}"
KEY_RESPONSE="$(yc iam access-key issue-ephemeral \
  --subject-id "${YC_DEPLOY_SERVICE_ACCOUNT_ID}" \
  --session-name "${SESSION_NAME}" \
  --policy "${SESSION_POLICY}" \
  --duration 1h \
  --format json)"

read -r ACCESS_KEY SECRET_KEY SESSION_TOKEN < <(node -e '
const key = JSON.parse(process.argv[1]);
for (const field of ["access_key_id", "secret", "session_token"]) {
  if (typeof key[field] !== "string" || !key[field]) process.exit(1);
}
process.stdout.write([key.access_key_id, key.secret, key.session_token].join(" "));
' "${KEY_RESPONSE}")

echo "::add-mask::${ACCESS_KEY}"
echo "::add-mask::${SECRET_KEY}"
echo "::add-mask::${SESSION_TOKEN}"
{
  printf 'AWS_ACCESS_KEY_ID=%s\n' "${ACCESS_KEY}"
  printf 'AWS_SECRET_ACCESS_KEY=%s\n' "${SECRET_KEY}"
  printf 'AWS_SESSION_TOKEN=%s\n' "${SESSION_TOKEN}"
  printf 'AWS_REGION=ru-central1\n'
  printf 'AWS_ENDPOINT_URL=https://storage.yandexcloud.net\n'
  printf 'AWS_ENDPOINT_URL_S3=https://storage.yandexcloud.net\n'
} >> "${GITHUB_ENV}"

unset KEY_RESPONSE ACCESS_KEY SECRET_KEY SESSION_TOKEN
echo 'issue-ephemeral-storage-key: issued a one-hour Object Storage session'
