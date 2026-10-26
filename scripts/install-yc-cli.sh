#!/usr/bin/env bash
set -euo pipefail

YC_CLI_VERSION='1.26.0'
YC_CLI_SHA256='b6bc853d132c40792675363d301241bf3e00d46daba49c8824b876816028eab3'
INSTALL_ROOT="${YC_CLI_INSTALL_ROOT:-${RUNNER_TEMP:-/tmp}/zvenfit-yc-cli-${YC_CLI_VERSION}}"
YC_BINARY="${INSTALL_ROOT}/yc"
DOWNLOAD_URL="https://storage.yandexcloud.net/yandexcloud-yc/release/${YC_CLI_VERSION}/linux/amd64/yc"
MAX_ATTEMPTS=4

mkdir -p "${INSTALL_ROOT}"

verified() {
  [[ -f "${YC_BINARY}" ]] && printf '%s  %s\n' "${YC_CLI_SHA256}" "${YC_BINARY}" | sha256sum --check --status
}

if verified; then
  echo "install-yc-cli: using the cached binary ${YC_CLI_VERSION}"
else
  # The 170 MB binary normally downloads in about 10 seconds. Each attempt is
  # bounded and gives up on a transfer slower than 20 KB/s for a minute, and the
  # next attempt resumes from the bytes already on disk instead of starting
  # over, so a slow but moving link still finishes while a stalled one fails in
  # minutes: an unbounded stalled download once held a production deploy for
  # 84 minutes. The workflow restores the verified binary from the Actions
  # cache first, so this download runs only after a cache miss.
  attempt=0
  until verified; do
    attempt=$((attempt + 1))
    if (( attempt > MAX_ATTEMPTS )); then
      echo "install-yc-cli: no verified binary after ${MAX_ATTEMPTS} download attempts" >&2
      exit 1
    fi
    if curl --fail --no-progress-meter --location \
      --connect-timeout 10 --max-time 150 \
      --speed-limit 20480 --speed-time 60 \
      --continue-at - \
      "${DOWNLOAD_URL}" --output "${YC_BINARY}"; then
      continue
    fi
    status=$?
    # 33: the server refused the resume range, so the partial file is useless.
    if (( status == 33 )); then
      rm -f "${YC_BINARY}"
    fi
    echo "install-yc-cli: attempt ${attempt} ended with download status ${status}; resuming" >&2
  done
fi

chmod 0755 "${YC_BINARY}"
"${YC_BINARY}" version

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "${INSTALL_ROOT}" >> "${GITHUB_PATH}"
else
  printf '%s\n' "${INSTALL_ROOT}"
fi
