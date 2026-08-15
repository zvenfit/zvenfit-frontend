---
type: dashboard
title: ZvenFit production monitoring
updated: 2026-08-15
---

# Production monitoring dashboard

- URL: https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/dashboards/zvenfit-production-monitoring
- Purpose: production lead pipeline, Telegram delivery, Fitbase schedule, Cloud Functions, traffic, and YDB health.
- Reading order: alert statuses, Telegram queue and heartbeat, then application and Cloud Functions diagnostics.
- Empty event graphs are normal while the corresponding alert is green.
- Refresh interval: one minute.

## Taxonomy and naming

- Dashboard: `ZvenFit · production`.
- Labels: `application=zvenfit-frontend`, `environment=production`.
- Global resources use `ZvenFit · <meaning>`; graph titles inside the dashboard do not repeat the product name.
- Alert rows expose exact component `service` and function `resource_id`.
- Function widgets expose `resource_id`; throttling is decomposed by `resource_id`.
- Notification methods: `ZvenFit · production · Telegram` and `ZvenFit · production · Email`.

## Runtime visibility

- Lead and schedule have paging runtime/application alerts.
- All three functions are visible on the shared `functions_errors` graph.
- `zvenfit-site-traffic` runtime failures remain diagnostic and do not page yet.
- Throttling identifies each of the three functions through a `resource_id` subalert.
