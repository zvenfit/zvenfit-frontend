---
type: runbook
title: ZvenFit alerts, metrics and logs runbook
updated: 2026-08-15
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
- Direct gauges require `application`, `environment`, `component`, and `resource_id`.
- Raw logs retain three days.
- No Lockbox or new monitoring infrastructure without separate approval.
- CDN query masking remains out of scope while no separate raw CDN pipeline is created.
- Production smoke uses only synthetic non-personal records and requires explicit confirmation.

## Incident path

1. Open the alert and capture `service`, `resource_id`, window, and delay.
2. Check the same function on errors, throttles, queue, inflight, memory, and duration graphs.
3. Search raw logs by component and narrow by event/request/error fields.
4. Inspect the source log metric or direct/platform series.
5. Confirm the later `OK` transition and delivery to both notification methods.
