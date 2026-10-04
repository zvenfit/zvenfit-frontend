---
type: runbook
title: ZvenFit alerts, metrics and logs runbook
updated: 2026-10-04
---

# Alerts, metrics and logs runbook

The complete tracked runbook is
[`docs/monitoring-operations.md`](../docs/monitoring-operations.md). This KB note
is the project entry point and intentionally does not duplicate every selector.

## Invariants

- Scope: `application=zvenfit-frontend`, `environment=production`.
- Components: `zvenfit-lead-intake`, `zvenfit-fitbase-schedule`, `zvenfit-site-traffic`.
- Exact function: `resource_id`.
- Runtime errors and throttling use grouped multialerts decomposed by `resource_id`.
- Managed `functions_errors` uses `max` over `5m`: one failed invocation still alarms,
  while repeated `DGAUGE` samples are not presented as an invocation count.
- Direct gauges require `application`, `environment`, `component`, and `resource_id`.
- The complete OTLP lifecycle shares one deadline of at most `5s`; timeout closes
  invocation-owned HTTP/HTTPS agents and blocks late connections and retries, and
  the warning names the failed `phase`;
  see the [timeout investigation](../docs/monitoring-operations.md#зависание-после-завершения-retry-worker-диагностика-28-сентября-2026).
  Logged exporter failures are counted through the independent
  `zvenfit_monium_metrics_failures_5m` log aggregate.
- Exporter alert evaluates `30m`, warns after three failures, and alarms after
  six; it sends email once without Telegram or repeats, while isolated timeouts
  remain graph-only diagnostics.
- Critical retry-worker heartbeat uses the independent
  `zvenfit_retry_worker_log_heartbeat_1m` aggregate; direct OTLP heartbeat is
  diagnostic only.
- Read-only retry-worker YDB queries recover transient session/query failures
  within one deadline; writes never opt in. The canonical recovery policy and
  module boundaries are in [backend architecture](../docs/backend-architecture.md#восстановление-чтений-ydb).
- YDB client-preparation failures record `initialization_attempts` separately from
  query/session `retry_attempts`; message-derived codes come only from a fixed safe allowlist.
- Transient YDB driver discovery uses up to three initialization attempts with
  `250ms` / `500ms` exponential backoff; permanent initialization errors fail immediately.
- Recovered YDB retries/slow queries use email diagnostics without repeats; they do not page Telegram.
- `retry_worker_deferred` means a known transient queue read could not recover in
  its budget. The next minute's timer resumes the durable outbox; no successful
  heartbeat or fabricated queue gauge is emitted. Three deferred passes in `10m`
  page via `zvenfit_retry_worker_deferred` after the `3m` ingestion delay.
- Missing successful passes still page through the independent log heartbeat.
  Storage writes, permanent delivery failures and unknown runtime failures remain urgent.
- Rollback: restore the previous function version; retain the runtime, storage,
  heartbeat and backlog alerts. The new deferred metric can remain idle (`No data = OK`).
- Raw logs retain 14 days.
- No Lockbox or new monitoring infrastructure without separate approval.
- CDN query masking remains out of scope while no separate raw CDN pipeline is created.
- Production smoke uses only synthetic non-personal records and requires explicit confirmation.

## Raw logs

- Open `https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs`.
- `project` alone is not an executable raw-log query in Monium. Add the required
  `service=default` label and run the query.
- Then isolate this project with `meta.application=zvenfit-frontend` and
  `meta.environment=production`; add `meta.service`, `resource_id`, `meta.event`,
  or `level` only when narrowing an incident.
- If the UI still says “select service”, the query has not run. If a complete
  query ran and the table is empty, expand the time range up to the 14-day
  raw-log retention window.

### Quick access

- [Recent production application events (INFO, one hour)][logs-info]
- [Recent production application errors (ERROR, one hour)][logs-error]

The same two links are available in the full-width first row of the production
dashboard, so an incident can be opened from the board without returning to Git.

Keep these two shared links as the canonical entry points instead of maintaining
many narrowly scoped saved searches. During an incident, open the relevant link,
set the alert time window including its evaluation delay, then add exactly one
or two narrowing labels: `meta.service`, `resource_id`, `meta.event`,
`meta.request_id`, or `meta.error_code`. Browser bookmarks are convenient for
personal access, but the Git-tracked links are the shared source of truth.

## Incident path

1. Open the alert and capture `service`, `resource_id`, window, and delay.
2. Check the same function on errors, throttles, queue, inflight, memory, and duration graphs.
3. Search raw logs by component and narrow by event/request/error fields.
4. Inspect the source log metric or direct/platform series.
5. Confirm the later `OK` transition and delivery to both notification methods.
   The exporter-failure alert is the documented exception: email once, without
   Telegram or repeat delivery.

For `monium_metrics_export_error`, first check `meta.error_type`,
`meta.error_code`, `meta.duration_ms`, and the
**Monium: сбои экспорта метрик** chart. The log-derived alert remains observable
when the direct OTLP heartbeat path itself is degraded.

[logs-info]: https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs?tab=logs&queries=NobwRAdghgtgpmAXGAgmANGAblANgVwWRAAcAnAewCs4BjAFwAIBeRgHTADMLcATOMgH1BAIwCMAczhi4AFgCWFEvXpUA7AE4AFp16cYHdIwDOArPNpwW7MP05R8ueoca44WOLmscAkgDkAMQB5F3h6KAA6KBISXAsoekUIbzAALw8ITnl6AFpOSgh6OAheULhwiOLzAvhClPIKXnwGJI4AXwwwLXlefggke1xTTF55YygRN14BvGGwIoAPegBZRqJB0zaAXSA&from=now-1h&to=now&columns=level%2Ctime%2Cmessage%2Chost&groupByField=level&chartType=column&linesMode=single&refresh=off
[logs-error]: https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs?tab=logs&queries=NobwRAdghgtgpmAXGAgmANGAblANgVwWRAAcAnAewCs4BjAFwAIBeRgHTADMLcATOMgH1BAIwCMAczhi4AFgCWFEvXpUA7AE4AFp16cYHdIwDOArPNpwW7MP05R8ueoca44WOLmscAogCU-AHk-F3h6KAA6KBISXAsoekUIbzAALw8ITnl6AFpOSgh6OAheULhwiOLzAvhClPIKXnwGJI4AXwwwLXlefggke1xTTF55YygRN14BvGGwIoAPegBZRqJB0zaAXSA&from=now-1h&to=now&columns=level%2Ctime%2Cmessage%2Chost&groupByField=level&chartType=column&linesMode=single&refresh=off
