# Static site generation with Astro in two releases

Status: approved by the owner on 2026-10-19, 2026-10-21 and 2026-10-22; stage 0
(preparation on the legacy build) in progress since 2026-10-22. The detailed
plan with stages, parity rules, rollback and estimates lives in
[`docs/future/astro-migration-plan.md`](../../docs/future/astro-migration-plan.md).
This record is the canonical list of decisions and their consequences; the plan
moves to `docs/astro-migration.md` when branch A opens.

## Decision

The site keeps its static output and gains a template layer: Astro with static
output and no client framework on pages (an island is allowed for a single
widget with a justification in the PR). The migration ships in two releases:

- **Release A**: the Astro build, all 41 pages converted with strict parity
  against a pinned legacy base, the legacy build retired. Existing scripts stay
  classic scripts referenced through `?url`; jQuery and `webflow.js` stay as
  they are, served from the bucket.
- **Release B**: assets. Optimised images, fonts and vendor files move into the
  repository under content-hashed names; `ASSET_VERSION` disappears from the
  build, the workflow and the deploy test.

## Decisions

| # | Date | Decision |
| --- | --- | --- |
| R1 | 2026-10-19 | Go ahead with the migration. |
| R2 | 2026-10-19 | Two releases: A is the build and the pages, B is the assets. |
| R3 | 2026-10-19 | Runtime configs stay at `/js/*-config.js` as Astro endpoints and are uploaded with `no-cache` (in place since v3.0.12). |
| R4 | 2026-10-19 | Trainer certificates and diplomas stay in the bucket. |
| R5 | 2026-10-19 | Optimised images, fonts and vendor files go into the repository; the originals stay in the bucket as an archive. |
| R6 | 2026-10-19 | Strict parity in release A; review items 6, 8 and 11 follow as separate PRs. |
| R7 | 2026-10-19 | Upload order: assets without `--delete`, crawl files, configs, HTML. Cleanup is a separate step (R13). |
| R8 | 2026-10-19 | E2E gate: the full autotests suite locally before merge, the 8 staging tests in the release. |
| R9 | 2026-10-21 | Coach photos never enter git: optimised copies go to the bucket with `Cache-Control`. |
| R10 | 2026-10-21 | Hotfixes during branch A: lead form breakage, prices, legal texts. Everything else waits for release A. |
| R11 | 2026-10-21 | Rollback only through staging, never with `skip_staging`. |
| R12 | 2026-10-21 | CDN: a minimal change is allowed if the edge caches HTML. Outcome below. |
| R13 | 2026-10-22 | Cleanup of stale assets runs outside the release workflow: a manual dispatch with dry-run by default and a mechanical guard. |
| R14 | 2026-10-22 | R3 and R7 land no later than the preparatory PR before branch A; rollback of A or B is a plain `git revert`. |
| R15 | 2026-10-22 | `--delete` stays inside the filters of passes 2 and 3; only the assets pass loses it. |
| R16 | 2026-10-26 | After release B the CDN cache key drops the `v` query parameter; until then the whitelist stays. |

Defaults that can be revisited on request: a bucket snapshot before release A
instead of bucket versioning; the phone mask served from our host before
branch A (PR #85); weekly Dependabot version updates with grouped minor and
patch; Yandex Maps organisation photos snapshotted into `src/data/`.

## Consequences

- `public/**`, `scripts/snippets/**`, `scripts/*.config.json` and
  `scripts/build-static.cjs` freeze when branch A opens, for 2–4 weeks, with
  the hotfix rule R10. The legacy stack rule in `AGENTS.md` holds until
  release A; branch A carries the new rule text from stage A1 (plan, section 14).
- Deploy protection shipped as v3.0.12: a guard before the first upload, four
  upload passes, assets never deleted in a release. Branch A inherits the
  workflow and changes only the deploy profile.
- The release publisher confirms a freshly created tag with bounded re-reads
  (v3.0.11): GitHub refs are eventually consistent.
- The Webflow runtime stays through releases A and B. Inventory on 2026-10-26:
  the dropdown menu on 15 pages, sliders on 9, tabs on 3, 19 IX2 interactions
  on 30 pages (13 click, 3 mouse over, 3 mouse out), the form wrapper on 1;
  197 KB of `webflow.js` and 89 KB of jQuery per page. Its delegated submit
  handler re-enabled the lead form button and showed the error block while a
  request was in flight (fixed in v3.0.9 by stopping the event). Replacing the
  runtime is review item 10, after release B.

### CDN (R12 outcome, 2026-10-26)

The edge honours the origin `Cache-Control`: HTML and crawl files with
`no-cache` were fresh right after the release, so HTML needs no CDN change. The
cache key is the path plus the `v` query parameter only. Objects uploaded with
`immutable` stay for a year under their key: when `js/*-config.js` moved to the
no-cache pass, the `?v=` keys were fresh while the bare keys `/js/*-config.js`
kept the old objects. Two purges by path did not reach the edge; a full purge
of the resource on 2026-10-26 did, within minutes, and the bare keys now serve
the no-cache objects. Settings, measurements and the purge procedure:
[`knowledge-base/cdn-runbook.md`](../cdn-runbook.md).

### Release gate

`main` has no branch protection. A merge needs a green `quality` check and the
CodeQL default setup check named `CodeQL`; a missing result is not a pass.
Every push to `main` releases: staging, E2E from `zvenfit-autotests`,
production, tag and GitHub release.

### Third-party assets and licences

| Asset | Where | Licence |
| --- | --- | --- |
| normalize.css 8 | bucket, into the repository in B | MIT |
| jQuery 3.5.1 | bucket, into the repository in B | MIT |
| imask 7.6.1 | `public/js/vendor/` since PR #85 | MIT, licence file next to it |
| Roboto, Roboto Condensed | fonts.bunny.net | Apache 2.0 |
| Webflow runtime (`webflow.js`, `webflow.min.css`) | exported with the site, bucket | Webflow terms for exported sites; confirm against the account's terms |
| Road Rage, Cyrillic build "RUS BY LYAJKA" | bucket `fonts/roadrage.ttf` | embedded licence text says "Free for personal use only" (© 2016 Youssef Habchi); the owner holds a purchased commercial licence (confirmed 2026-10-26), kept outside the repository. |

Sources: [migration plan](../../docs/future/astro-migration-plan.md),
[staging runbook](../staging-runbook.md),
[CDN runbook](../cdn-runbook.md), font name table of
`fonts/roadrage.ttf`, CDN resource settings from `yc cdn resource list`.
