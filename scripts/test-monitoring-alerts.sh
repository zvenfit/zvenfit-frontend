#!/usr/bin/env bash
set -euo pipefail

LOG_GROUP_NAME="${YC_LOG_GROUP_NAME:-default}"

if [[ "${1:-}" != "--confirm" ]]; then
  echo "Usage: bash scripts/test-monitoring-alerts.sh --confirm" >&2
  echo "This writes synthetic ERROR records and intentionally triggers production alerts." >&2
  exit 2
fi

if ! command -v yc >/dev/null 2>&1; then
  echo "test-monitoring-alerts: install and configure Yandex Cloud CLI (yc)" >&2
  exit 1
fi

write_event() {
  local event="$1"
  local level="${2:-ERROR}"

  yc logging write \
    --group-name="${LOG_GROUP_NAME}" \
    --level="${level}" \
    --message="${event}" \
    --json-payload="{\"event\":\"${event}\",\"synthetic\":true,\"source\":\"monitoring-smoke-test\"}"
}

write_event lead_storage_error
write_event telegram_delivery_failed_permanently
write_event fitbase_schedule_error

for _ in 1 2 3 4 5 6; do
  write_event ydb_retry WARN
done

write_event ydb_slow_operation WARN

echo "test-monitoring-alerts: synthetic events written to ${LOG_GROUP_NAME}"
echo "Expect five log-based alerts to enter ALARM after their evaluation windows."
echo "Verify Telegram and email delivery, then acknowledge the test alerts in Monitoring."
