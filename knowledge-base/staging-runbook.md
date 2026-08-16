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
- The latest full deploy and Playwright verification succeeded in
  [GitHub Actions run 31974155448](https://github.com/zvenfit/zvenfit-frontend/actions/runs/31974155448).

## Manual deployment

1. Dispatch `.github/workflows/staging.yml` from `main`.
2. Approve the Environment gate for the isolated Function jobs after validation
   and quality checks are green.
3. Approve the site deployment gate after all Function jobs succeed.
4. Approve the E2E gate after the site smoke test succeeds.
5. Require the complete workflow, including the Playwright job, to finish green.

## E2E safety invariants

- `playwright.config.cjs` rejects every origin except the exact
  `https://staging.zvenfit.ru` origin before a browser starts.
- The suite receives only staging Basic Auth credentials. It receives no
  Fitbase, Telegram, Monium, Yandex Cloud, or production credentials.
- The lead scenario submits an invalid browser form and asserts that no
  `/api/lead` request is made.
- Schedule coverage reads the staging-only synthetic provider.
- The synthetic User-Agent is classified separately from real visitors.

Every push to `main` also starts the production deployment workflow. Do not
approve or mutate an unrelated production run while operating staging; use a
`[skip ci]` documentation-only commit when no deploy workflow should run.
