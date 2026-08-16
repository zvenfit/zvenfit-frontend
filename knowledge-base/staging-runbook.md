---
type: runbook
title: ZvenFit staging deployment and E2E runbook
updated: 2026-08-17
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
- GitHub Environment `staging` accepts deployments only from `main`, requires a
  configured reviewer approval, and permits self-review for the current
  single-maintainer workflow.
- The latest full deploy and cross-repository Playwright verification succeeded
  in [GitHub Actions run 31977617090](https://github.com/zvenfit/zvenfit-frontend/actions/runs/31977617090).
- The verified reusable suite is pinned to
  [`zvenfit-autotests@6bd13be`](https://github.com/zvenfit/zvenfit-autotests/commit/6bd13bef9d3e69a570f9fa2e7aadbd1fe179cd09).
- The autotests default branch is protected by review and the required
  `quality` status check; the repository keeps an administrator bypass for the
  current single-maintainer workflow.
- The latest full read-only production suite succeeded in
  [GitHub Actions run 31978139884](https://github.com/zvenfit/zvenfit-autotests/actions/runs/31978139884).

## Manual deployment

1. Dispatch `.github/workflows/staging.yml` from `main`.
2. Approve the Environment gate for the isolated Function jobs after validation
   and quality checks are green.
3. Approve the site deployment gate after all Function jobs succeed.
4. Approve the E2E gate after the site smoke test succeeds. This gate belongs
   to the cross-repository reusable workflow executed in the frontend run.
5. Require the complete workflow, including the external Playwright job, to
   finish green.

## E2E safety invariants

- `playwright.staging.config.ts` in `zvenfit-autotests` rejects every origin
  except the exact `https://staging.zvenfit.ru` origin before a browser starts.
- `.github/workflows/staging.yml` pins both the reusable workflow call and its
  checkout input to the same immutable autotests commit SHA.
- The suite receives only staging Basic Auth credentials. It receives no
  Fitbase, Telegram, Monium, Yandex Cloud, or production credentials.
- Basic Auth credentials are scoped to the Playwright execution step and to the
  exact staging origin. External document navigations are blocked.
- The lead scenario submits an invalid browser form, aborts any attempted
  `/api/lead` request, and asserts that the request count remains zero.
- Schedule coverage reads the staging-only synthetic provider.
- The synthetic User-Agent is classified separately from real visitors.

Every push to `main` also starts the production deployment workflow. Do not
approve or mutate an unrelated production run while operating staging; use an
explicit `[skip ci]` commit when the change is deployment-neutral and will be
verified by a manual staging workflow.

Deploy workflows derive `ASSET_VERSION` from the unique GitHub run number.
Never restore a fixed Environment override: a stable query string can leave old
CSS or JavaScript in CDN/browser caches after a successful upload.
