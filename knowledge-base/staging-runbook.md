---
type: runbook
title: ZvenFit staging deployment, E2E and frontend rollback runbook
updated: 2026-11-27
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

The workflow and `npm run deploy:yc` publish in the same order: (1) assets with `immutable`, never with `--delete`,
excluding HTML, crawl files and `js/*-config.js`; (2) `robots.txt` and
`sitemap.xml` with no-cache; (3) `js/*-config.js` with no-cache, so a config
is refreshed before the HTML that references it; (4) HTML with no-cache.
`--delete` stays only inside the crawl, config and HTML filters, so a removed
page disappears with the release while assets referenced by previously
served HTML are never deleted by a release or a rollback. Stale assets are
reviewed in the [manual cleanup procedure](#manual-asset-cleanup).

For a local publication, build the intended production or staging `dist/` first.
`npm run deploy:yc` reads the asset version from its HTML and rebuilds a clean
archive of `HEAD` (or `LOCAL_DEPLOY_REVISION`) with the selected environment’s
public build variables. For either managed site bucket, refresh `origin/main`
with `git fetch origin main` and choose a revision in its history. Supply the same API URLs and maps key via the environment
or Vite’s mode-specific env files. Installation uses the lockfile. A failed
guard or byte difference stops the command before its first storage request.
It uploads the verified copy and stamps every HTML object with `deployed-sha`,
`asset-version` and `runtime-config-sha256` before removing obsolete HTML. This also refreshes metadata when
an existing object has the same size and timestamp. Release uses the same
unconditional HTML upload followed by size-only reconciliation. Coordinate a local upload
with the owner outside any active or queued release or cleanup.

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
  [manual cleanup](#manual-asset-cleanup) can resume after the rollback window closes.
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
after the release, newest first, and then `ba8dd91`. In that order every
revert applies cleanly: each one undoes the newest state, the tree after the
last of them is the tree of the release, and the revert of the release then
gives the tree of `d5aeb4a`, the commit before it. This was checked on
2026-11-17 with the removal of the converter as the only later change. The
price is that everything merged after the release goes with it. A later
commit that has to survive the rollback, a fix in `functions/` for instance,
is left out of that list, and what conflicts then is resolved by the rules of
"Conflicts of a revert made after later commits". The result needs the whole
gate again. For a defect found after the acceptance consider a fix forward
first.

The revert of release A also takes this section and
`scripts/snapshot-bucket.sh` out of `main`: they arrived with the release
commit. After such a rollback read them from that commit, for example
`git show ba8dd91:knowledge-base/staging-runbook.md` for the text as it was
released.

## Manual asset cleanup

1. After this change has shipped, open **Actions → Clean up stale site assets →
   Run workflow** on `main`. Run **staging** and **production** separately,
   both with `execute` unchecked, `min_age_days=2` and `prefixes=_astro/`.
   Release, manual staging and cleanup share the `deploy` lock and queue.
   Each waits its turn. Up to 100 runs can wait; GitHub rejects a new arrival
   when the queue is full. The cleanup job uses the selected Environment with
   deployment tracking disabled. Its temporary storage key can list and read
   objects in the selected site bucket. Execute adds deletion under `_astro/`.
   You can re-run an older dry-run. It uses that dispatch’s rules and reads the
   SHA deployed now, so its candidate list can differ from the first attempt.
2. Read the summary. Verify the environment, bucket and full SHA against the
   last site deployment. The workflow reads the SHA and asset version from
   the selected bucket’s `index.html` object metadata, then builds and checks
   that exact checkout. It reads the three API URLs and the public maps key from the
   four deployed `js/*-config.js` files as data. CI and local deploys record their
   combined SHA-256 in each HTML object. The workflow checks that digest before the
   rebuild and compares the rebuilt configs, live configs and page stamps before execute.
   Rotating the maps key or changing a function URL therefore preserves the ability to
   rebuild an earlier release. A release stamped with only SHA and asset version can
   still be inspected in dry-run. Execute requires the config digest from a verified deployment.
   Dependency installation,
   build scripts and checks run in a container with the tracked sources, Node
   toolchain and public site settings. Only its `dist/` output is mounted writable.
   The host keeps the Environment’s OIDC and storage credentials. It reads every HTML
   object directly from storage, including 404. All pages must carry that
   release metadata and match the rebuilt HTML byte for byte, including
   inline CSS and scripts. Every `_astro/` file in the build, including
   indirect dependencies such as fonts, must exist in the bucket. Asset URLs
   in inline and built stylesheets are resolved against their document or
   stylesheet URL. Literal JavaScript module imports resolve against the module
   URL. Linked and preloaded site scripts and stylesheets, including their local
   module and CSS imports, must exist in the build and match their bytes in storage, even when
   their names are outside `_astro/`. Each page’s import maps resolve exact,
   scoped and package-prefix imports against the base URL in effect when the map
   is parsed. A relative script or stylesheet placed before a later `<base>`
   loads relative to the page URL. The check also covers the later base for
   navigation from form submit buttons and inline event handlers.
   The planner checks the object URL and the page’s directory URL. On staging it also
   checks the slashless route served by the gateway. A missing page can return
   `404.html` at any URL. Use root-relative or absolute resource URLs there, or
   place a fixed `<base href="/">` before relative resources. Planning stops if a
   404 script’s relative URL can address an old asset in the bucket.
   A nonempty `iframe[srcdoc]`, a same-site embedded document (including SVG in
   `<object>`), a navigation URL using `javascript:`, `data:` or `vbscript:`, or a
   `meta refresh` directive with content stops planning and reports the page.
   Production HTTP links to the site on its default port follow the CDN redirect to HTTPS.
   The planner also reads literal site asset URLs in inline and emitted
   JavaScript, including URLs assembled from constant strings. Service worker
   registrations through a container alias use the same checks as direct
   registrations, including access through a constant property name. An unknown
   property of the service worker container stops the check. If code passes
   the registration method to another script
   before fixing the worker URL, the planner stops. Relative literals are checked against
   document bases and the script’s own URL for worker requests. A computed import or an explicit
   asset path in a template with an unknown filename stops the check. This also
   applies to worker requests through `fetch`, `Request`, `XMLHttpRequest.open`,
   `EventSource` and `importScripts` when the filename cannot be resolved.
   Missing release metadata, an incomplete upload or a mismatch
   calls for checking and repairing the last site deploy before retrying.
3. Each row is an object under `_astro/` that is absent from the entire built
   tree and was last written **strictly before** the UTC cutoff. The timestamp
   and byte size let the owner check why it qualifies and reconcile the total.
   If the table exceeds the step summary budget, the summary keeps the counts,
   byte totals, cutoff and a link to the job log for that attempt. Open **Verify live HTML
   and process candidates** there for the complete table in the log.
   Old files still in the build, including indirectly referenced assets, stay
   protected. Legacy `js/`, `css/` and `images/` await a separate scope
   change after B. Trainer photos and documents and the `zvenfit/v2` asset
   store are outside this procedure.
4. For a separately authorised deletion, wait at least 48 hours after the
   last completed release or rollback in that environment and until its
   rollback window has closed. Object age alone cannot protect an old asset
   whose last HTML reference was removed yesterday. The summary shows the
   earliest time allowed by the last HTML write. Check the deploy history for
   a later completion, a failed release or an ongoing recovery. Resolve those
   first. Start a new dispatch on current `main` with the same inputs and
   `execute` checked. The workflow checks the dispatch SHA against `main`
   before authentication, then reads the bucket and recomputes the plan under
   the lock. Immediately before deleting it checks the current `main` ref on
   GitHub again. If the ref has moved or cannot be read, start a fresh run
   after checking the new policy. Check the final
   confirmed deletion count. The step updates that count and logs the key after
   each successful storage response. After a cancellation or timeout, use the
   last confirmed entry in the log and run a fresh dry-run to determine what
   remains. A request in flight when the runner stopped has an unknown outcome. [Retention calculation](cdn-runbook.md#minimum-age-for-asset-cleanup)

Example dry-run summary (fixture data)

```text
Mode: dry-run · staging · zvenfit-frontend-staging
Deployed SHA: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa · asset version 175
Verified HTML pages: 2. Distinct /_astro/ references: 2.
Candidates: 2 · Total bytes: 8192. Under _astro/, absent from dist,
LastModified strictly before 2026-11-25T12:00:00.000Z (2 days).
Rollback window from latest HTML upload ends at 2026-11-22T10:00:00.000Z.

Key             LastModified (UTC)         Bytes
_astro/old.css  2026-11-20T10:00:00.000Z    6144
_astro/old.js   2026-11-20T10:00:00.000Z    2048
```

For a local read-only check, set `CLEANUP_ENVIRONMENT` to `staging` or
`production`, use AWS CLI v2 credentials that can list the bucket and read HTML,
scripts and stylesheets. Install the control checkout’s dependencies with `npm ci`.
`node scripts/cleanup-bucket-assets.cjs --deployment` prints the deployed
SHA and asset version. Prepare a fresh checkout of that SHA. On Linux with Docker,
run `node scripts/cleanup-bucket-assets.cjs --rebuild <fresh-checkout>` from the
control checkout to reproduce the workflow’s build and guards. It reads the deployed
settings into the build process environment. From the control checkout run
`node scripts/cleanup-bucket-assets.cjs <built-checkout>` to print the summary.
The local command rejects execute mode. Only the manual workflow processes
deletions, using the checkout it rebuilt and verified under the release lock.

**Recovery.** Stop cleanup in the affected environment. Copy the exact object
key from the confirmed deletion log and match it to the failing URL. Record
the currently deployed SHA. Starting with the last release that served that
URL, rebuild candidate releases with their original SHA, asset version and
environment. For each build, set `build` to its checkout and `key` to the
exact object key from the log. Verify it is present:

```bash
test -f "$build/dist/$key"
```

Select a SHA whose build contains that key. The current release can restore
it only if it passes this check. If no verified build contains it, keep cleanup
paused and investigate the release history with the owner before redeploying.
Use the selected SHA in the applicable recovery path below.

- **Staging only.** When the required SHA is the head of `main`, dispatch
  **Deploy to Staging** on `main` and wait for staging E2E. For an older SHA,
  use **Re-run all jobs** on an eligible **Deploy to Staging** run for that
  exact SHA. If it predates HTML metadata stamping, the restored site will serve
  the assets but cleanup must remain paused until a metadata-aware release.
  If there is no such run, arrange a staging-only recovery of that verified revision with the owner.
- **Production.** When the required SHA is the head of `main`, dispatch
  **Release** on `main` with `skip_staging` unchecked. Follow staging, E2E,
  production and smoke. For an older revision, prepare the revert on current
  `main` using the [frontend rollback procedure](#frontend-rollback). Before
  merging, build the actual recovery candidate with production settings. Set
  `candidate` to that checkout and `build` to the verified historical build.
  Check that the candidate will upload the exact key with its original bytes:

  ```bash
  cmp -- "$build/dist/$key" "$candidate/dist/$key"
  ```

  A later change in the same stylesheet can give a clean revert a different
  filename. If the check fails, keep cleanup paused. Restore the inputs from
  the verified release in the recovery PR. For the global stylesheet, restore
  `src/styles/zvenfit.webflow.css` and, if it changed, the build configuration
  and pinned toolchain that produced it. The build generates one hashed global
  stylesheet from that source and checks its minified bytes. If reproducing
  the key requires reverting other changes, agree that rollback with the owner.
  Run the build guards and repeat the byte comparison after any change to the
  candidate or its base. Use the regular
  release through staging and E2E after the check passes.

Both workflows upload the assets before switching HTML. Verify the affected
URLs, watch the 404 metric and restart the rollback window for each environment
that was deployed.

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
