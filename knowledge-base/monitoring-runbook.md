---
type: runbook
title: ZvenFit alerts, metrics and logs runbook
updated: 2026-08-24
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
- OTLP export has a bounded `3s` timeout; exporter failures are counted through
  the independent `zvenfit_monium_metrics_failures_5m` log aggregate.
- Exporter alert evaluates `30m`, warns after three failures, and alarms after
  six; isolated timeouts remain graph-only diagnostics.
- Read-only retry-worker YDB queries retry one transient session/query failure;
  write operations never opt in to this retry.
- YDB client-preparation failures record `initialization_attempts` separately from
  query/session `retry_attempts`; message-derived codes come only from a fixed safe allowlist.
- A single slow YDB query is graph-only; two in `10m` warn and three alarm.
- Raw logs retain three days.
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
  query ran and the table is empty, expand the time range up to the three-day
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

For `monium_metrics_export_error`, first check `meta.error_code` and the
**Monium: сбои экспорта метрик** chart. The log-derived alert remains observable
when the direct OTLP heartbeat path itself is degraded.

[logs-info]: https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs?tab=logs&queries=NobwRAdghgtgpmAXGAgmANGAblANgVwWRAAcAnAewCs4BjAFwAIBeRgHTADMLcATOMgH1BAIwCMAczhi4AFgCWFEvXpUA7AE4AFp16cYHdIwDOArPNpwW7MP05R8ueoca44WOLmscAkgDkAMQB5F3h6KAA6KBISXAsoekUIbzAALw8ITnl6AFpOSgh6OAheULhwiOLzAvhClPIKXnwGJI4AXwwwLXlefggke1xTTF55YygRN14BvGGwIoAPegBZRqJB0zaAXSA&from=now-1h&to=now&columns=level%2Ctime%2Cmessage%2Chost&groupByField=level&chartType=column&linesMode=single&refresh=off
[logs-error]: https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs?tab=logs&queries=NobwRAdghgtgpmAXGAgmANGAblANgVwWRAAcAnAewCs4BjAFwAIBeRgHTADMLcATOMgH1BAIwCMAczhi4AFgCWFEvXpUA7AE4AFp16cYHdIwDOArPNpwW7MP05R8ueoca44WOLmscAogCU-AHk-F3h6KAA6KBISXAsoekUIbzAALw8ITnl6AFpOSgh6OAheULhwiOLzAvhClPIKXnwGJI4AXwwwLXlefggke1xTTF55YygRN14BvGGwIoAPegBZRqJB0zaAXSA&from=now-1h&to=now&columns=level%2Ctime%2Cmessage%2Chost&groupByField=level&chartType=column&linesMode=single&refresh=off
