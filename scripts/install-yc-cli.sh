#!/usr/bin/env bash
set -euo pipefail

YC_CLI_VERSION='1.26.0'
YC_CLI_SHA256='b6bc853d132c40792675363d301241bf3e00d46daba49c8824b876816028eab3'
INSTALL_ROOT="${RUNNER_TEMP:-/tmp}/zvenfit-yc-cli-${YC_CLI_VERSION}"
YC_BINARY="${INSTALL_ROOT}/yc"

mkdir -p "${INSTALL_ROOT}"
# The 170 MB binary normally downloads in about 10 seconds. A transfer slower than
# 100 KB/s for 30 seconds is treated as stalled and restarted, and every error is
# retried: an unbounded stalled download once held a production deploy for 84 minutes.
curl --fail --no-progress-meter --location \
  --connect-timeout 10 --max-time 120 \
  --speed-limit 102400 --speed-time 30 \
  --retry 5 --retry-all-errors \
  "https://storage.yandexcloud.net/yandexcloud-yc/release/${YC_CLI_VERSION}/linux/amd64/yc" \
  --output "${YC_BINARY}"

printf '%s  %s\n' "${YC_CLI_SHA256}" "${YC_BINARY}" | sha256sum --check --status
chmod 0755 "${YC_BINARY}"
"${YC_BINARY}" version

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "${INSTALL_ROOT}" >> "${GITHUB_PATH}"
else
  printf '%s\n' "${INSTALL_ROOT}"
fi
