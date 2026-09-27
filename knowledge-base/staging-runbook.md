---
type: runbook
title: ZvenFit staging deployment and E2E runbook
updated: 2026-09-28
---

# Staging deployment and E2E runbook

The complete environment contract is tracked in
[`docs/staging-environment.md`](../docs/staging-environment.md). This note keeps
the current operational state and the shortest safe deployment path.

## Verified state

- `https://staging.zvenfit.ru` uses Cloudflare DNS, an issued managed TLS
  certificate, and a Yandex API Gateway custom domain.
- The bucket, YDB, Functions, runtime identities, and deploy identity are
  isolated in the staging folder. The browser reaches Functions only through
  same-origin Gateway routes protected by HTTP Basic auth.
- The attached Smart Web Security profile runs API smart protection and has an
  Advanced Rate Limiter profile attached.
- GitHub Environment `staging` accepts deployments only from `main`. It has no
  reviewer approval since 2026-09-28: staging is the automatic first stage of
  every release (owner decision of 2026-09-27).
- The latest full deploy and cross-repository Playwright verification succeeded
  in [GitHub Actions run 31977617090](https://github.com/zvenfit/zvenfit-frontend/actions/runs/31977617090).
- The verified reusable suite is pinned to
  [`zvenfit-autotests@52b6975`](https://github.com/zvenfit/zvenfit-autotests/commit/52b6975bc4e504111bda7dd543163930b1ba196c).
- The autotests default branch is protected by review and the required
  `quality` status check; the repository keeps an administrator bypass for the
  current single-maintainer workflow.
- The latest full read-only production suite succeeded in
  [GitHub Actions run 31978139884](https://github.com/zvenfit/zvenfit-autotests/actions/runs/31978139884).

## Deployment

Every push to `main` runs `.github/workflows/main.yml` (**Release**): staging
deploy, the cross-repository E2E suite, and only after both succeed the
production deploy and release tag. No approval step exists.

To re-run staging and E2E without a production release, dispatch
`.github/workflows/staging.yml` from `main`. It shares the `deploy` concurrency
group with **Release**, so it waits while a release is running.

Emergency path: dispatch **Release** from `main` with `skip_staging` and a
`reason` only when staging or E2E are themselves broken and production needs an
urgent fix. Quality checks and the production smoke test still run.

## E2E safety invariants

- `playwright.staging.config.ts` in `zvenfit-autotests` rejects every origin
  except the exact `https://staging.zvenfit.ru` origin before a browser starts.
- `.github/workflows/main.yml` and `.github/workflows/staging.yml` pin both the
  reusable workflow call and its checkout input to the same immutable autotests
  commit SHA; a script test fails if the two workflows drift apart.
- The suite receives only staging Basic Auth credentials. It receives no
  Fitbase, Telegram, Monium, Yandex Cloud, or production credentials.
- Basic Auth credentials are scoped to the Playwright execution step and to the
  exact staging origin. External document navigations are blocked.
- The lead scenario submits an invalid browser form, aborts any attempted
  `/api/lead` request, and asserts that the request count remains zero.
- Schedule coverage reads the staging-only synthetic provider.
- The synthetic User-Agent is classified separately from real visitors.

A `[skip ci]` commit skips the whole release, staging included; its changes
ship with the next release.

Deploy workflows derive `ASSET_VERSION` from the unique GitHub run number.
Never restore a fixed Environment override: a stable query string can leave old
CSS or JavaScript in CDN/browser caches after a successful upload.
