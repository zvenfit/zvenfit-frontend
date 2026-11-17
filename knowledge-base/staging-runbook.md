---
type: runbook
title: ZvenFit staging deployment, E2E and frontend rollback runbook
updated: 2026-11-17
---

# Staging deployment, E2E and frontend rollback runbook

The complete environment contract is tracked in
[`docs/staging-environment.md`](../docs/staging-environment.md). This note keeps
the current operational state, the shortest safe deployment path, the rollback
of a frontend release and the bucket snapshot taken before a risky one.

## Verified state (as of 2026-11-17)

Every line names how it was checked. What needs the cloud console keeps the
date of its last inspection, 2026-09-28.

- `https://staging.zvenfit.ru` is a CNAME to a Yandex API Gateway custom
  domain, in a zone served by Cloudflare DNS (DNS lookup, 2026-11-17). Its
  managed TLS certificate and the HTTP Basic auth in front of every route
  were exercised by the release run below: the staging smoke test and the E2E
  suite went through that origin.
- The bucket, YDB, Functions, runtime identities, and deploy identity are
  isolated in the staging folder. The browser reaches Functions only through
  same-origin Gateway routes protected by HTTP Basic auth. The release run
  below passed "Preflight private staging storage boundary" and "Verify
  uploaded staging objects remain private"; the folder itself was last
  inspected on 2026-09-28.
- The attached Smart Web Security profile runs API smart protection and has an
  Advanced Rate Limiter profile attached (last inspected on 2026-09-28).
- GitHub Environment `staging` accepts deployments only from `main` and has no
  reviewer approval (GitHub API, 2026-11-17). It has had none since
  2026-09-28: staging is the automatic first stage of every release (owner
  decision of 2026-09-27).
- Release A, `v3.2.0` (commit `ba8dd91`), the first release built by Astro,
  went through the whole pipeline on 2026-11-16 in
  [GitHub Actions run 43929544009](https://github.com/zvenfit/zvenfit-frontend/actions/runs/43929544009):
  staging deploy and its smoke test, 8 of 8 E2E tests, production deploy and
  its smoke test, the tag. It was accepted on 2026-11-17.
- The reusable suite is pinned in `main.yml` and `staging.yml` to
  [`zvenfit-autotests@775c884`](https://github.com/zvenfit/zvenfit-autotests/commit/775c88461fc3fa2ae7de6274d2b2d6ad3ff788f0).
- The autotests default branch is protected by a ruleset: a pull request with
  one approving review and the required `quality` status check. Organisation
  and repository administrators can bypass it, which the current
  single-maintainer workflow relies on (GitHub API, 2026-11-17).
- The read-only production suite of that revision passed against the Astro
  build on 2026-11-17 in
  [GitHub Actions run 44067519281](https://github.com/zvenfit/zvenfit-autotests/actions/runs/44067519281):
  105 tests, 104 passed at once and 1 on a retry. The full suite against a
  build of `main` passed the same day in
  [run 44069341889](https://github.com/zvenfit/zvenfit-autotests/actions/runs/44069341889):
  201 passed, 57 skipped.

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

## Upload order and pre-upload guard

`deploy-site` verifies the exact `dist/` it is about to upload before the
first `aws s3 sync`: `scripts/check-routes.cjs` proves the HTML route set
equals the source pages, the indexable routes equal `sitemap.xml`, every
runtime config and crawl file exists and every local `/js`, `/css` and
`/_astro` reference resolves; `check-build.cjs` (and `check-staging-build.cjs`
on staging) run against the same tree. An empty or partial build never reaches
the bucket. The routes come from the sources: the pages of `src/pages` and
the entries of the trainer collection. The profile in
`scripts/deploy.config.json` is `a`, set by release A; `b` is reserved for
release B. The `legacy` profile, whose routes were the HTML files of
`public/`, is no longer accepted by the guard.

Upload runs as four commands in a fixed order, identical in the workflow and
in `npm run deploy:yc`: (1) assets with `immutable`, never with `--delete`,
excluding HTML, crawl files and `js/*-config.js`; (2) `robots.txt` and
`sitemap.xml` with no-cache; (3) `js/*-config.js` with no-cache, so a config
is refreshed before the HTML that references it; (4) HTML with no-cache.
`--delete` stays only inside the crawl, config and HTML filters, so a removed
page disappears with the release while assets referenced by previously
served HTML are never deleted by a release or a rollback. Stale assets are
removed only by a separate manual cleanup (see the Astro migration plan).

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
Since release A it versions only the bucket-hosted `webflow.js?v=`: the site's
own scripts and stylesheets are served from `/_astro/` under content-hashed
names. Never restore a fixed Environment override: a stable query string can
leave an old `webflow.js` in CDN/browser caches after a successful upload.

## Frontend rollback

A frontend release is rolled back by reverting its commit on `main` and letting
the normal release run: staging deploy, E2E, production deploy, smoke test
(decision R11 in [ADR 002](decisions/002-astro-migration.md)). Production is
never rolled back directly: no `skip_staging`, no manual upload to the bucket,
no moved tag. A release is one squash commit on `main`, so its rollback is one
revert. The revert is clean while no later commit has changed the same files;
see "Release A after its acceptance" below for the release that no longer is.

When to roll back, by where the release failed:

1. Staging smoke or E2E failed. Production is untouched. Fix forward with a new
   pull request if the cause is clear within an hour, otherwise revert.
2. The production smoke test failed after the upload. The site is not rolled
   back automatically: open the revert pull request at once. If the CDN serves
   stale HTML, purge it as the [CDN runbook](cdn-runbook.md) says.
3. Staging passed and production behaves differently. Watch for 30 minutes
   after the release: the share of 404 in the CDN metric
   `edge.requests_status` and the page views of `site-traffic` in Monium must
   not be worse than in the hour before. Revert if they are.
4. The CI of `zvenfit-autotests` or its daily production smoke turned red after
   the merge. Fix forward here, or pin the frontend ref in their workflow until
   the fix is released.

Steps:

1. Create the revert from the current `main` (or press **Revert** on the merged
   pull request, which does the same):

   ```bash
   git fetch origin
   git switch -c hotfix/revert-<release> origin/main
   git revert --no-edit <full SHA of the release commit>
   git push -u origin hotfix/revert-<release>
   gh pr create --base main --title 'Revert "<title of the release commit>"' --body '<why>'
   ```

   The version of the rollback release follows from every commit since the
   last tag. A title that starts with `Revert` does not match `feat:`, so the
   rollback is a patch release when the reverted release already has its tag.
   A release that failed before **Publish production release** has no tag: its
   commit is counted too, and the rollback takes the version that release
   would have had.
2. Wait for `quality` and CodeQL on the pull request. Before a real rollback
   repeat the E2E gate (decision R8) for the revert SHA: the full suite of the
   pinned `zvenfit-autotests` revision against a local build of that commit
   ([plan](../docs/astro-migration.md), section 8, step 2).
3. Merge with squash and without an administrator bypass, then follow the
   **Release** run to its tag. The rollback takes as long as the pipeline does:
   about ten minutes is usual and is not a guarantee.
4. Repeat the 30-minute watch of scenario 3 and the checks of
   [`docs/launch-checklist.md`](../docs/launch-checklist.md).

What the revert does:

- The first upload pass puts the assets of the reverted build back before the
  HTML switches, even if a manual cleanup has removed them. The assets of the
  rolled-back release stay in the bucket: a release never deletes assets. The
  cleanup of stale assets is a separate manual procedure that the migration
  plan adds after release A and that does not exist yet; once it does, do not
  run it while the rollback window is open, that is for the time HTML may stay
  cached after the last release or rollback.
- If an upload pass fails, the later passes do not run. Re-run the failed jobs
  of the same run, or go through a new pull request; never finish the upload
  by hand.
- Deploy protection (the four upload passes, the pre-upload guard, the profile
  field of `scripts/deploy.config.json`, the contract test) has been in `main`
  since v3.0.12, before release A. The revert of release A cannot remove it: it
  sets the profile back to `legacy` and brings back the guard and the
  `check-build` of that time, which read the routes from `public/`. A pull
  request that returned `--delete` to the assets pass would fail
  `deploy-lead-intake.test.cjs` in `quality`.
- Release A does not change `functions/`: its revert redeploys the same
  function code.

Conflicts of a revert made after later commits:

- A fix made in `src/` after the release gives modify/delete conflicts. Accept
  the deletion and carry the fix over to `public/` by its diff.
- Root `package.json` and `package-lock.json`: take the versions from before
  the release whole, then re-apply the updates that are still needed.
- Checks and tests that a later commit changed (`scripts/check-routes.cjs`,
  `project-checks.json`, the tests in `scripts/__tests__/`): take the versions
  from before the release whole. A file the release added and a later commit
  changed gives modify/delete: accept the deletion.
- Functions and later fixes in `functions/` are kept.

For a release as large as release A the revert is prepared in advance. Before
the merge a candidate is built locally: the squash of the branch on top of
`main`, its revert, the tree of the revert equal to the tree of `main`, then
the build, `npm run test:scripts` and `npm run test:build` on it. Right after
the merge the revert of the actual release SHA is opened as a draft pull
request and must pass `quality`; it stays open and unmerged until the release
is accepted, and nothing else is merged into `main` meanwhile, so that the
rollback stays a merge of that pull request.

### Release A after its acceptance

Release A was accepted on 2026-11-17 and its draft revert
([pull request 116](https://github.com/zvenfit/zvenfit-frontend/pull/116))
was closed unmerged. The commits that followed change files of the release:
the converter and the comparison with the legacy build are removed, the guard
no longer knows the `legacy` profile, and the documents describe the new
state. `git revert ba8dd91` alone, on top of them, stops on conflicts: in
18 files on 2026-11-17, among them `package.json`, the checks with their
tests, and the documents.

Revert in order instead, in one pull request: every commit made to `main`
after the release, newest first, and then `ba8dd91`. As long as those commits
change nothing but what the release brought, each revert applies cleanly and
the tree ends up equal to the tree of `d5aeb4a`, the commit before the
release; this was checked on 2026-11-17 for the first of them, the removal of
the converter. A later commit that has to survive the rollback, a fix in
`functions/` for instance, is left out of that list, and what conflicts then
is resolved by the rules of "Conflicts of a revert made after later commits".
The result needs the whole gate again. For a defect found after the
acceptance consider a fix forward first.

The revert of release A also takes this section and
`scripts/snapshot-bucket.sh` out of `main`: they arrived with the release
commit. After such a rollback read them from that commit, for example
`git show ba8dd91:knowledge-base/staging-runbook.md` for the text as it was
released.

## Bucket snapshot before a release

`scripts/snapshot-bucket.sh` copies a bucket into a directory outside the
repository. The owner takes it before a release that replaces what the bucket
serves, in place of bucket versioning (a default of
[ADR 002](decisions/002-astro-migration.md)); the snapshot taken before
release A is kept until release B. It holds the exact objects production
served, among them the HTML of the last legacy build. A rebuild of the same
commit need not give the same bytes: the legacy build read the map photos
from Yandex Maps at build time and put the run number into asset URLs. A
rollback does not need the snapshot: the revert rebuilds the previous site.
Restoring objects from a snapshot is a separate manual decision of the owner,
outside the release path, and follows the upload order and cache headers of
"Upload order and pre-upload guard".

The script only lists and reads the bucket; it has no command that writes to
it or deletes from it. It refuses a target inside the repository, creates
`<directory>/<bucket>-<UTC time>/` with the objects under `objects/`, saves the
listing next to them (keys, sizes, ETags, modification times) and exits with
an error unless every listed object is on disk with its size and nothing else
is. Where the ETag is a plain MD5, that is for every object not uploaded in
parts, the bytes are checked against it as well.

```bash
# What would be downloaded; nothing is written.
SNAPSHOT_TOOL=yc bash scripts/snapshot-bucket.sh ~/zvenfit-bucket-snapshots --dry-run
# The snapshot of the production bucket.
SNAPSHOT_TOOL=yc bash scripts/snapshot-bucket.sh ~/zvenfit-bucket-snapshots
```

- `SNAPSHOT_TOOL=yc` uses the active profile of the Yandex Cloud CLI and needs
  no static key. The CLI marks its `storage s3` and `storage s3api` commands
  as preview. Run it from an interactive terminal: the owner's profile
  authenticates through the browser, and after that sign-in the cached token
  serves later runs. The path was first run against the production bucket on
  2026-11-16 with CLI 1.30.0, for the snapshot before release A: 61 objects,
  every one verified by size and MD5. The listing came as `contents` with
  `key`, `size` (a string), `etag` and `last_modified`. The dry run lists what
  the copy would download and does not exercise the listing or the
  verification. Should a later CLI print the listing in a shape the script
  cannot read, the run fails instead of passing; nothing in the bucket is
  affected.
- Without `SNAPSHOT_TOOL` the script uses the AWS CLI (`aws s3 sync`) and its
  credential chain: `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` with
  `AWS_SECRET_ACCESS_KEY` and, for a temporary key, `AWS_SESSION_TOKEN`. The
  key needs read access to the bucket, listing included. The endpoint is
  `https://storage.yandexcloud.net`, the region `ru-central1`.
- `SNAPSHOT_BUCKET` selects another bucket, for example
  `zvenfit-frontend-staging`; the default is `zvenfit-frontend`.

The script prints no credentials and stores none. Keep the snapshot out of
any repository and out of synced folders that are shared with others.

## Lost connections during smoke and E2E

Staging and the public function URLs sit behind a shared Yandex Cloud ingress.
During the October 2026 incident (#2136) about half of all TCP handshakes to
API Gateway and Cloud Functions were never answered while `api.cloud.yandex.net`
and Object Storage stayed healthy, so every deploy job succeeded and only the
post-upload smoke failed with `fetch failed`.

- `scripts/smoke-production.cjs` repeats a request that got no response at all
  (lost handshake, reset, timeout) on a fresh connection, up to 8 attempts with
  a 500 ms pause. HTTP responses are never retried: a 4xx or 5xx still fails the
  smoke. Every retry is logged with its attempt number and cause, so a degraded
  ingress stays visible in the job log.
- The staging E2E suite in `zvenfit-autotests` reaches staging through a local
  CONNECT proxy that re-dials the origin the same way; its README documents the
  `STAGING_CONNECT_RETRY` switch.
