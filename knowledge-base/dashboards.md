---
type: dashboard
title: ZvenFit production monitoring
updated: 2026-08-16
---

# Production monitoring dashboard

- URL: https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/dashboards/zvenfit-production-monitoring
- Native JSON snapshot: [`scripts/monitoring.dashboard.json`](../scripts/monitoring.dashboard.json).
- Purpose: production lead pipeline, Telegram delivery, Fitbase schedule, Cloud Functions, traffic, and YDB health.
- Reading order: alert statuses, Telegram queue and heartbeat, then application and Cloud Functions diagnostics.
- The first row contains one-click `INFO за час` and `ERROR за час` links to
  production application logs. The same canonical URLs are tracked in the
  monitoring runbook.
- Empty event graphs are normal while the corresponding alert is green.
- Refresh interval: one minute.
- Layout grid: 36 columns. Paired charts use 18 columns each; when a section has
  an unpaired final chart, it spans all 36 columns so the section ends without
  a ragged empty area.

## Backup and restore

- Export/import path: **Dashboard settings → JSON**.
- Export with **Без diff**; restore by pasting the Git snapshot and reviewing
  **Встроенный diff** before **Применить**.
- The snapshot covers only the dashboard. Alerts, log metrics and notification
  channels remain described by `scripts/monitoring.config.json` and are managed
  separately.
- After an intentional live change, export again and commit the server-normalized
  JSON. Do not hand-maintain Monium-generated UUIDs.

## Taxonomy and naming

- Dashboard: `ZvenFit · production`.
- Labels: `application=zvenfit-frontend`, `environment=production`.
- Global resources use `ZvenFit · <meaning>`; graph titles inside the dashboard do not repeat the product name.
- Single-function alert rows expose exact component `service` and function
  `resource_id`; Cloud Functions multialert subalerts expose `resource_id`.
- Function widgets expose `resource_id`; runtime errors and throttling are
  decomposed by `resource_id`.
- Notification methods: `ZvenFit · production · Telegram` and `ZvenFit · production · Email`.

## Runtime visibility

- All three production functions page through the shared runtime multialert.
- All three functions are visible on the shared `functions_errors` graph.
- Schedule keeps its additional application and runtime log alerts.
- Runtime errors and throttling identify each function through a `resource_id` subalert.
