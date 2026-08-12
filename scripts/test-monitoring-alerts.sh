#!/usr/bin/env bash
set -euo pipefail

LOG_GROUP_NAME="${YC_LOG_GROUP_NAME:-default}"
MONITORING_ENVIRONMENT="${NODE_ENV:-production}"
APPLICATION_NAME="zvenfit-frontend"

if [[ ! "${MONITORING_ENVIRONMENT}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "test-monitoring-alerts: NODE_ENV contains unsupported characters" >&2
  exit 2
fi

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
    --json-payload="{\"application\":\"${APPLICATION_NAME}\",\"environment\":\"${MONITORING_ENVIRONMENT}\",\"event\":\"${event}\",\"synthetic\":true,\"source\":\"monitoring-smoke-test\"}"
}

write_event lead_storage_error
write_event telegram_delivery_failed_permanently
write_event fitbase_schedule_error

for _ in 1 2 3 4 5 6; do
  write_event ydb_retry WARN
done

write_event ydb_slow_operation WARN

for _ in 1 2 3 4 5 6; do
  yc logging write \
    --group-name="${LOG_GROUP_NAME}" \
    --level=WARN \
    --message=lead_submission_blocked \
    --json-payload="{\"application\":\"${APPLICATION_NAME}\",\"environment\":\"${MONITORING_ENVIRONMENT}\",\"event\":\"lead_submission_blocked\",\"reason\":\"rate_limit\",\"synthetic\":true,\"source\":\"monitoring-smoke-test\"}"
done

for _ in {1..21}; do
  write_event lead_persisted INFO
done

echo "test-monitoring-alerts: synthetic events written to ${LOG_GROUP_NAME}"
echo "The synthetic Fitbase event intentionally exercises the production Fitbase alert."
echo "The YDB storage alert must be checked against live platform metrics, not synthetic logs."
echo "Verify Telegram and email delivery, then acknowledge the test alerts in Monitoring."
