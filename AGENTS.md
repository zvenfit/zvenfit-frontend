# Agent guide — ZvenFit Frontend

Краткий контракт для AI-агента и новых контрибьюторов. Полный backlog: [`TODO.md`](TODO.md).

## Project-specific agent rule

<!-- personal-ai-workspace-code-policy:v1 -->

- Workspace identity: `REP-001`, domain `zvenfit`, product `PROD-001`. See `repo-manifest.json` and [local integration instructions](docs/personal-ai-workspace.md).
- Follow Personal AI Workspace's knowledge-routing and context-access rules. This file defines the repository's stack, implementation constraints, and checks.
- Keep curated business context, product goals, project plans, status, and Product/Project/Repository cards in the personal Workspace's `vault/`. Keep source code, technical decisions, architecture, build/deployment instructions, and runbooks in this repository (`knowledge-base/`, `docs/`, and `README.md`).
- Maintain one canonical source for each fact. Link between Workspace cards and repository documentation instead of copying either knowledge base. The existing `knowledge-base/` remains the version-controlled technical knowledge base; adoption does not relocate it.
- Resolve an adopted repository's machine-local Workspace pointer with `git rev-parse --git-path personal-ai-workspace/local.json`. If the bridge is not configured or unavailable, report that limitation; do not guess a Workspace path or scan neighbouring projects.
- Access only Workspace context needed for the current task: use its metadata selector when an exact note path is unknown, then its exact-file cloud preflight for each note before reading its body. Follow the Workspace's active-client and sensitivity rules; never load the whole vault or unrelated cross-project context.
- Repository documentation may be staged, committed, and pushed only to this repository's configured Git remote after checking that it contains no secrets or personal data. Workspace runtime notes and machine-local absolute paths must not be committed here.
- Do not synchronize either knowledge base to Stefania Wiki, DataCatalog, remote knowledge-base adapters, or another assistant's memory. Connecting the local Workspace does not authorize publication, synchronization, push, or deployment.
- Work only with this repository, the task's explicitly selected Personal AI Workspace context, and tools needed for the user's request.

## Cross-repository test ownership

- `zvenfit-autotests` is the only repository that owns Playwright, browser E2E specs, Playwright configs, fixtures, and reusable browser-test workflows.
- Never add `@playwright/test`, `playwright`, `playwright-core`, `playwright*.config.*`, or browser E2E source files to `zvenfit-frontend`.
- This repository may own unit, integration, build, deployment, and static contract tests. Its deploy workflows (`main.yml`, `staging.yml`) may only call the reusable E2E workflow from `zvenfit-autotests`.
- Pin both the cross-repository reusable workflow reference and its checkout input to the same full immutable commit SHA, identical in `main.yml` and `staging.yml`.
- Publish and validate browser-test changes in `zvenfit-autotests` first; only then update the pinned SHA here.
- If a task asks to add Playwright or browser E2E while working in this repository, implement that part in `zvenfit-autotests` instead of crossing the boundary.

## Stack

- **Frontend:** фронтенд собирается Astro в статический `dist/`; страницы живут в
  `src/pages`, общая разметка в `src/layouts` и `src/components`, данные в
  `src/content` и `src/data`, статика как есть в `public/`. Клиентский
  фреймворк на страницах не используется; островок допустим для отдельного
  виджета с обоснованием в PR. Не предполагать React или Next.
- **Astro since release A** (`v3.2.0`, 2026-11-16; plan
  [`docs/astro-migration.md`](docs/astro-migration.md), ADR
  `knowledge-base/decisions/002-astro-migration.md`). Every route is built
  from Astro sources: 20 pages in `src/pages` and 21 trainer pages rendered by
  `src/pages/trenery/[slug].astro` from the `trainers` collection
  (`src/content/trainers/*.json`). The legacy build is not in the tree:
  `scripts/build-static.cjs`, `scripts/snippets/` and the pages, styles and
  scripts of `public/` exist only in git history, last in
  `d5aeb4a95be8759028064da03b0f40e89ca38db7` (`v3.1.4`). `public/` holds
  static files that Astro copies to `dist/` as they are (two SVG logos).
  Release B (assets) has not started.
- **The pages are sources, and no check compares the built site.** Release A
  shipped with strict parity to the legacy build and was accepted on
  2026-11-17. The converter of the migration (`scripts/migrate/`) and the
  tests that held `src/pages/**` and `src/content/trainers/*.json` to its
  output are removed, and so is the `compare-dist` job that compared every
  pull request with the legacy build: pages, trainer entries, stylesheets and
  browser scripts are edited by hand like any other source. The other side of
  it: nothing notices an unintended change of the markup. `check-routes`,
  `check-build` and the E2E suite of `zvenfit-autotests` hold contracts and
  behaviour, not every node. A change that must not alter the site (a
  component refactoring, a dependency update, tooling) is therefore proven by
  building the commit before and the commit after with the same variables and
  comparing the two `dist/` with `diff -r` (see Verification). The comparison
  tool of the migration stays in `scripts/` for release B and runs by hand
  only.
- **Build:** `npm run build` = `astro build --mode $NODE_ENV` (production,
  staging or development) → `dist/`. A build is reproducible: built twice
  with the same variables, a commit gives the same bytes.
- **Runtime JS:** classic vanilla scripts in `src/scripts/`, referenced through
  `?url` and served hashed from `/_astro/`; vendor files in `src/vendor/`;
  stylesheets in `src/styles/`. The runtime configs stay at `/js/*-config.js`
  as endpoints.
- **CSS:** Vite's minifier is off (`vite.build.cssMinify: false`). The
  `zvenfit:site-css` integration (`scripts/lib/site-css.cjs`) minifies
  `zvenfit.webflow.<hash>.css` after the build with clean-css level 2, the
  same bytes as the legacy `zvenfit.webflow.min.css`; other stylesheets are
  emitted unminified. lightningcss with the `esnext` target of Astro
  rewrites `(max-width: 767px)` into `(width<=767px)`, which Safari before 16.4
  and Chrome before 104 ignore. The clean-css version is pinned in that
  module: the built file name follows the source bytes, not the minifier.
- **Backend:** 4 TypeScript Yandex Cloud Functions in `functions/` (compiled to CommonJS): `lead-intake`, `fitbase-schedule`, `site-traffic`, `staging-authorizer`
- **CI:** `quality.yml` checks pull requests in one job, `quality` (lint, tests, `astro check`, production-like and staging builds with `check-routes` and `check-build`). `main.yml` (**Release**) runs on every push to `main`: staging deploy → E2E from `zvenfit-autotests` → production deploy (functions → build → S3 → smoke) → release tag; production is skipped unless E2E passes. An emergency dispatch with `skip_staging` and a `reason` deploys production without staging. `staging.yml` re-runs staging and E2E manually without a release. All deploys share `_deploy-environment.yml` and the `deploy` concurrency group.

TypeScript is used for Cloud Functions, Astro frontmatter, endpoints and the
`src/lib` helpers; the browser scripts remain classic vanilla JS until the
post-migration revision.

## Source of truth

| Edit                                                       | Do not edit                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `src/` (pages, layouts, components, scripts, styles, data) | `dist/`, `.astro/`                                             |
| `public/` (static files copied to `dist/` as they are)     | a file in `public/` at the path of a route: it replaces the page or the endpoint |
| `scripts/` (checks, deploy, the comparison tool)           | the whitespace of `src/layouts`, `src/components` and `src/pages` with a formatter (see Build pipeline markers) |
| `functions/`                                               | committed secrets                                              |

After any change in `src/`: run `npm run build` or use `npm run dev`. The
legacy site (`public/**/*.html`, `scripts/snippets/**`,
`scripts/build-static.cjs`) is not in the tree: release A replaced it, and it
is read from git history when needed, for example
`git show d5aeb4a:public/offer/index.html`. A fix of the live site, like any
change of content, is a pull request into `main` that changes `src/`: the
pages and the trainer entries are edited directly, there is no generator to
run. How fixes were carried over from the legacy build during the migration
is recorded in the plan ("Перенос исправлений из legacy").

## Module conventions

- Keep Cloud Function `index.ts` files as entrypoints with re-exports only; implementation belongs in named modules such as `handler.ts`.
- Keep tests in a sibling `__tests__/` directory and name them after the module they cover.

## Architecture

```
Browser (zvenfit.ru)
  ├─ POST lead form → functions/lead-intake → YDB → Telegram
  │                                      ↑ retry timer
  └─ GET /raspisanie/ → functions/fitbase-schedule → provider
                                                    ├─ production: Fitbase API
                                                    └─ staging: dynamic fixture

Browser page-view beacon → functions/site-traffic → Cloud Logging → Monium

staging.zvenfit.ru → API Gateway + Basic auth (functions/staging-authorizer)
  → private bucket and private staging builds of the functions above

Local dev (npm run dev):
  mock-server :3000  ← lead POST + GET /schedule + POST /traffic
  astro dev :4173    ← pages and endpoints from src/
```

The build renders the API URLs into endpoints:

- `src/pages/js/lead-config.js.ts` → `/js/lead-config.js` → `window.ZVENFIT_LEAD_API`
- `src/pages/js/schedule-config.js.ts` → `/js/schedule-config.js` → `window.ZVENFIT_SCHEDULE_API`
- `src/pages/js/traffic-config.js.ts` → `/js/traffic-config.js` → `window.ZVENFIT_TRAFFIC_API`

## Build pipeline markers

`src/layouts/Base.astro` renders the shared document: head (bucket-hosted
normalize/webflow CSS, the site stylesheet, Webflow bootstrap, icons,
analytics, UTM, Open Graph, JSON-LD) and the body tail (jQuery, bucket
`webflow.js?v=ASSET_VERSION`, the page's own scripts in slot `scripts`, map
scripts, traffic beacon). **Whitespace in these templates is deliberate**: it
reproduces the legacy pages node for node, and between inline content a
space is part of what the visitor reads. Prettier is disabled for
`src/layouts`, `src/components` and `src/pages`: do not reformat them, and
change whitespace only where that change is the point. No check compares the
output any more, so a reformatting would go unnoticed.

| Component                                       | Purpose                                                           | Data                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Analytics.astro`                               | GTM + Top.Mail.Ru + Metrika, production only; `placement`, GTM comment style | raw legacy snippets in `src/components/analytics/`              |
| `UtmHead.astro`                                 | UTM attribution script (every mode)                               | `src/scripts/utm-attribution.js`                                 |
| `OpenGraph.astro`                               | OG/Twitter meta in the legacy order                               | page props, `src/data/structured-data.config.json`               |
| `StructuredData.astro`                          | JSON-LD graph                                                     | `src/lib/structured-data*.ts`, `src/data/structured-data.config.json` |
| `Menu.astro` + `LogoEmbeds.astro`               | variants `home`, `service`, `coach`, `plain` (Webflow `menu1`, `menu2`, `menu2-coach`, `menu3`) | page props, exact `w-node-*` ids of the page |
| `Footer.astro` (`FooterDesktop`, `FooterMobile`, `FooterGrid`) | `section-4`/`section-3` pair: `location`, `withGrid`, `withMobile`, `withMap`, `badges`, `anchorId`, `mobileAnchorId` | `src/lib/footer.ts` |
| `MapRegion.astro`, `MapScripts.astro`           | runtime map region and scripts                                    | `src/data/maps.config.json`, `src/data/map-photos.json`          |
| `AppDownloadBadges/Platforms/Promo.astro`       | store badges and app sections                                     | `src/data/app-links.config.json`                                 |
| `TrafficBeacon.astro`                           | technical page views (not on 404)                                 | `src/scripts/traffic-beacon.js`                                  |

Endpoints in `src/pages`: `js/lead-config.js.ts`, `js/schedule-config.js.ts`,
`js/traffic-config.js.ts` read `LEAD_API_URL`, `SCHEDULE_API_URL`,
`TRAFFIC_API_URL` at build time (development falls back to the mock server,
staging and production fail without a value); `js/maps-config.js.ts` combines
`src/data/maps.config.json`, the committed photo snapshot and `Y_MAPS_API_KEY`;
`sitemap.xml.ts` collects `export const sitemap = { updated, changefreq,
priority }` from every page and `updated`/`sitemap` of every trainer entry
(`src/lib/sitemap.ts` validates them);
`robots.txt.ts` serves
`src/data/robots.production.txt` or the staging `Disallow: /`;
`js/vendor/imask-7.6.1.LICENSE.txt.ts` serves the MIT text of the vendored
imask from `src/vendor/` at its legacy address (the minified file has no
licence banner; `check-build` compares the built bytes with the source).
Content configs live in `src/data/*.config.json`. An endpoint is a route like
a page: a file in `public/` at its path would be shipped instead of it.

Compiler facts to respect (details in the plan, section 4): comments passed as
component children are dropped, emit them via `set:html`; a raw `U+00A0` in a
template becomes a plain space, write `&nbsp;`; `{`/`}` in text are
expressions, escape them as `&#123;`/`&#125;`; every classic `<script>` needs
`is:inline`; component templates lose leading and trailing whitespace;
directly inside a component's children, whitespace that follows an expression
`{…}` is dropped (keep such gaps as expressions, as `trenery/[slug].astro` does).

The `trainers` collection (`src/content.config.ts`, schema in
`src/lib/trainer-schema.ts`): one JSON entry per trainer, the file name is the
slug and must be `trener-<name>.json`. `StructuredData.astro` (Person,
breadcrumb) and the sitemap read it; the structured-data config has no
`trainers` block any more. The optional `legacy` block of an entry holds
markup differences between the legacy pages (the schema explains each field);
a new trainer does not need it.

A trainer page is styled by the site stylesheet alone, with no fallback by
class. The grid is laid out by the `#w-node-…-<suffix>` rules of the entry's
`wfPage` (the suffix is its last eight digits), the two photos by
`.photo_coach.<photoClass>` and `.photo_coach_mini.<photoClass>`; the photo
rules without a modifier show Efim's photos. A new entry therefore needs the
`wfPage` of an existing page with the same layout or its own `w-node` rules in
`src/styles/zvenfit.webflow.css`, and a `photoClass` that has both photo rules
there. Such an entry still builds: `check-build` is what fails on a trainer
page whose ids or photo class have no rules, and on a page without a photo
class other than Efim's. Adding the rules is an ordinary change of the site
stylesheet: its built file gets a new content hash.

## Task → file map

| Task                       | Files                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Pages (Astro)              | `src/pages/**/index.astro`, `src/pages/404.astro`                                          |
| Trainer pages              | `src/content/trainers/*.json`, `src/lib/trainer-schema.ts`, `src/pages/trenery/[slug].astro`; grid and photo rules in `src/styles/zvenfit.webflow.css`, guard in `scripts/check-build.cjs` |
| Comparison of two builds   | `scripts/compare-dist.cjs`, `scripts/parity-allowlist.json`, `scripts/lib/html-parity.cjs`, `scripts/lib/parity-harness.cjs`, `scripts/lib/parity-profile.cjs`; a manual tool kept for release B, no job runs it (see Verification) |
| Static files               | `public/` (two SVG logos); guard against a file at the path of a route in `scripts/check-build.cjs` |
| CSS minification           | `scripts/lib/site-css.cjs`, `astro.config.mjs`; guard in `scripts/check-build.cjs` |
| Layout and shared blocks   | `src/layouts/Base.astro`, `src/components/`                                                 |
| Lead form UI/validation    | `src/pages/forma-dlya-zayavki/index.astro`, `src/scripts/lead-form.js`                      |
| Lead API / Telegram        | `functions/lead-intake/src/handler.ts`, `src/telegram/`                                     |
| Lead storage / retry state | `functions/lead-intake/src/ydb/`                                                            |
| Schedule UI                | `src/pages/raspisanie/index.astro`, `src/scripts/schedule.js`                               |
| Schedule API / Fitbase     | `functions/fitbase-schedule/src/handler.ts`, `src/adapters/fitbase/`                        |
| Technical site traffic     | `src/scripts/traffic-beacon.js`, `src/components/TrafficBeacon.astro`, `functions/site-traffic/src/` |
| UTM in leads               | `src/scripts/utm-attribution.js`, `docs/utm-attribution-marketing.md`                      |
| App store badges/links     | `src/data/app-links.config.json`, `src/components/AppDownload*.astro`                       |
| SEO / JSON-LD / Open Graph | `src/data/structured-data.config.json`, `src/lib/structured-data*.ts`, `src/components/OpenGraph.astro`, page props |
| Maps                       | `src/data/maps.config.json`, `src/data/map-photos.json` (`npm run maps:snapshot`), `src/scripts/yandex-map.js`, `src/components/MapRegion.astro` |
| Runtime API configs        | `src/pages/js/*-config.js.ts`, `src/lib/runtime-config.ts`                                  |
| Prices and page ownership  | `knowledge-base/site-information-architecture.md`                                           |
| Club card page             | `src/pages/klubnaya-karta/index.astro`, `src/styles/klubnaya-karta.v1.css`. Its menu and footer are markup of the page, not `Menu.astro` and `Footer.astro`: the menu has an `<img>` logo, an `aria-label` and no Webflow node ids, the footer is wrapped in `div#contacts.club-card-contacts` and differs in `rel` and in the opening hours |
| Global styles              | `src/styles/zvenfit.webflow.css`                                                            |
| Alerts / dashboard         | `scripts/monitoring.config.json`, `docs/monitoring.md`                                      |
| Staging access             | `functions/staging-authorizer/`, `docs/staging-environment.md`                              |
| Deploy                     | `.github/workflows/`, `scripts/deploy-*.sh`, `scripts/deploy.config.json`                  |
| Rollback of a release      | `knowledge-base/staging-runbook.md` ("Frontend rollback"): a `git revert` pull request through the normal release |
| Bucket snapshot            | `scripts/snapshot-bucket.sh`, `scripts/lib/bucket-snapshot.cjs`; read-only, run by the owner with their own credentials (`knowledge-base/staging-runbook.md`) |

## Local development

```bash
cp .env.example .env.development   # fill values
npm install
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm ci --prefix functions/site-traffic
npm ci --prefix functions/staging-authorizer
npm run dev                        # mock API :3000 + astro dev :4173
```

- Node ≥ 22.23.4 (`.nvmrc`): Astro 7.4 refuses older releases; CI uses
  `setup-node` with `check-latest: true`.
- `astro dev --mode development` reads `.env.development`; the lead form posts to
  `http://localhost:3000` when `LEAD_API_URL` is empty.
- `npm run dev:dist` builds in development mode and serves `dist/` on :4173
  with the same mock API: the built output (hashed assets, the minified site
  stylesheet, endpoints as files) instead of the dev server.
- Schedule uses dynamic fixture by default (`SCHEDULE_PROVIDER=fixture`)
- Live local data requires both `SCHEDULE_PROVIDER=fitbase` and `FITBASE_API_TOKEN`

## Verification

The Workspace check contract is `project-checks.json`. Run `python3 scripts/check.py --list` to review it; execute selected checks only with the returned `--execute-reviewed <review_digest>` and any required write/network flags. The runner does not provide OS sandboxing. Existing npm commands remain available below.

```bash
npm run check                    # astro check: types of components, props and endpoints
npm run build                    # must produce dist/ (NODE_ENV selects production, staging, development)
npm run lint                     # src/ (js, ts, astro), astro.config.mjs and all functions
npm run test:lead-fn             # durable storage, Telegram failure paths, metrics export deadline (needs openssl)
npm run test:schedule-fn         # schedule contract, Fitbase and synthetic adapters
npm run test:site-traffic        # page-view validation/classification/logging contract
npm run test:staging-authorizer  # staging Basic auth
npm run test:scripts             # build, deploy, monitoring, import and comparison scripts
npm run test:build               # astro check + build + check-routes + check-build
npm run test:build:staging       # protected staging build with the same guards
npm run maps:snapshot            # refresh src/data/map-photos.json from Yandex Maps (network)
```

`check-routes` and `check-build` always see the whole site: 41 HTML routes and
40 sitemap URLs today. The deploy profile in `scripts/deploy.config.json` is
`a`; `b` is reserved for release B, and `legacy` is no longer accepted.

No check compares the built site with an earlier one. A change that must not
alter it (a component refactoring, a dependency update, tooling) is proven by
two builds with the same variables, the commit before in a throwaway worktree:

```bash
export LEAD_API_URL=https://example.invalid/lead SCHEDULE_API_URL=https://example.invalid/schedule TRAFFIC_API_URL=https://example.invalid/traffic ASSET_VERSION=compare
git worktree add --detach ../before origin/main
(cd ../before && npm ci && npm run build)
npm run build
diff -r ../before/dist dist && echo "the built site did not change"
git worktree remove --force ../before
```

An empty diff means the same site, byte for byte. A changed browser script or
stylesheet shows as a renamed `_astro/<name>.<hash>` file plus the pages that
reference it. This is the production build, the one with analytics; repeat it
with `NODE_ENV=staging` and with `NODE_ENV=development` when the change
touches what differs between the modes. A local `.env` or `.env.local` is
read in every mode and exists in the working tree only: move it away first.

`npm run compare:dist` is the node-by-node comparison of the migration
(`scripts/compare-dist.cjs`; plan, section 8). No job and no entry of
`project-checks.json` runs it. It builds two commits in disposable worktrees
(`npm ci` inside), needs the network once and the whole history; both SHAs
are explicit, and `HEAD` is accepted for a local run.

- Profile `a` compares a commit with the legacy build of
  `d5aeb4a95be8759028064da03b0f40e89ca38db7`. It passed for release A and, on
  2026-11-17, for the tree right after the converter was removed. From the
  first change of a page, a text, a stylesheet or a browser script it fails by
  design: its report then lists what differs from the legacy site and is not
  a gate.
- Profile `b` compares two Astro commits and is what release B needs. In
  production mode it does not work yet: it recognises the hashed
  `/_astro/` addresses on the candidate side only and reports every reference
  to an own asset. It is brought into working order when branch B opens,
  together with its job in `quality.yml` (plan, section 8).
- `--mode staging` builds one commit twice and allows only the documented
  differences between its production and its staging build; with profile `b`
  it works today.

`test:monitoring` and `test:lead-import` run subsets of `test:scripts` when only that area changed.

Manual smoke:

- `/forma-dlya-zayavki/` — submit form, check mock-server log
- `/raspisanie/` — schedule renders

## Secrets & security

- Never commit tokens, SA keys, or real `.env*`
- Never create a Lockbox secret without the user's explicit approval; it is a billable resource
- Bot token / chat ID live only in Cloud Function env + GitHub Secrets
- CORS origins: `ALLOWED_ORIGINS` in workflow and function env

## Brand constraints (do not override)

From `TODO.md` — keep current identity:

| Keep                   | Do not replace with |
| ---------------------- | ------------------- |
| Green `#00d10e`        | Orange `#F97316`    |
| Roadrage + Roboto      | Barlow Condensed    |
| Dark fitness aesthetic | Generic AI landing  |

## Common mistakes

1. Editing `dist/` directly — changes are lost on next build
2. Copy-pasting footer/header into pages — use `Footer.astro`, `Menu.astro` and the other components; a block that does not fit the component contract gets a prop of the component, or stays markup of the page with the reason in the pull request (the club card page is the one such page, see Task → file map)
3. Expecting a check to notice a changed page — since the converter and the `compare-dist` job were removed, no job compares the built site: read the diff of the built output for a change of content, and for a change that must not alter the site compare two builds with `diff -r` (see Verification)
4. Reformatting `src/layouts`, `src/components` or `src/pages` — the whitespace reproduces the legacy pages, a space between inline content is visible to the visitor, and no check fails on it any more
5. Raw `U+00A0` or HTML comments inside component children in `.astro` templates — the compiler rewrites the first and drops the second; use `&nbsp;` and `set:html`
6. Putting a file into `public/` at the path of a route (a page, a trainer page, `robots.txt`, `sitemap.xml`, `/js/*-config.js`) — Astro ships the file instead of the route and only warns; `check-build` fails
7. Pushing to `main` — it starts a release (staging, E2E, then production); work on a branch and open a pull request
8. Turning Vite's CSS minification back on, or setting `build.cssTarget` or a browser `build.target` — stylesheets get media range syntax and old Safari and Chrome lose the responsive layout; a config test and `check-build` fail
9. Rolling a release back by hand (an upload to the bucket, `skip_staging`, a moved tag) — a rollback is a `git revert` pull request that goes through the normal release: staging, E2E, production (`knowledge-base/staging-runbook.md`, "Frontend rollback")

## Git branches

- Do not use the `codex/` prefix.
- Choose a semantic prefix: `feature/`, `bugfix/`, `hotfix/` (urgent production fix), `chore/`, `docs/`, or `refactor/`.
- Keep the rest short, lowercase and kebab-case, for example `bugfix/telegram-ipv4`.

## Pages

`src/pages/**/index.astro` plus `404.astro`, each page exporting
`sitemap = { updated, changefreq, priority }`: home, service pages
(`personalnye-trenirovki`, `gruppovye-trenirovki`, `parnye-trenirovki`,
`pilates-na-reformere/*`, `trenazhernyj-zal/*`), `klubnaya-karta`,
`raspisanie`, `forma-dlya-zayavki`, `trenery/` (index), `promos/*`, legal
(`privacy`, `offer`, `payment-policy`), `contacts/platforms`. The 21 trainer
pages come from `src/content/trainers/*.json` through
`src/pages/trenery/[slug].astro`. `src/pages/sitemap.xml.ts` and
`robots.txt.ts` generate the crawl files, so there is no hand-written sitemap.
All of them were generated from the legacy export by the converter of the
migration. The converter was removed once release A was accepted: the pages
and the trainer entries are edited by hand, and the legacy export they came
from is in git history (last in `d5aeb4a`).

## Docs index

| File                                | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `README.md`                         | Architecture, local start, checks                   |
| `docs/setup.md`                     | YC + Telegram + GitHub Secrets setup                |
| `docs/backend-architecture.md`      | Function layers, composition roots, artifacts       |
| `docs/staging-environment.md`       | Private staging gateway and deploy                  |
| `docs/launch-checklist.md`          | Production release checklist                        |
| `docs/monitoring.md`                | Logs, metrics, alerts, dashboard                    |
| `docs/monitoring-operations.md`     | Log selectors, retention, incident runbook          |
| `docs/site-traffic-analytics.md`    | Stateless page views and traffic classes            |
| `docs/utm-attribution-marketing.md` | UTM for marketing team                              |
| `docs/astro-migration.md`           | Astro migration: invariants, stages, parity contract |
| `docs/future/`                      | Ideas and discovery plans not approved for work yet |
| `knowledge-base/_index.md`          | Technical runbooks and page ownership               |
| `TODO.md`                           | UI/UX + infra backlog with priorities               |
