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
- **Release A in progress** (branch `feature/astro-release-a`, plan
  [`docs/astro-migration.md`](docs/astro-migration.md), ADR
  `knowledge-base/decisions/002-astro-migration.md`). After stage A1 the three
  legal pages (`/offer/`, `/privacy/`, `/payment-policy/`) are Astro pages;
  the other 37 pages and `404.html` are still the legacy export in `public/`
  until A2a converts them, and `scripts/build-static.cjs` stays until A2b as the
  parity base. Until then `astro.config.mjs` serves `static/` (two SVG logos)
  instead of `public/`, and `public/**`, `scripts/snippets/**`,
  `scripts/*.config.json`, `scripts/build-static.cjs` are frozen: hotfixes
  only (decision R10), through `main` and `git merge main` into the branch.
- **Build:** `npm run build` = `astro build --mode $NODE_ENV` (production,
  staging or development) → `dist/`. Strict parity with the pinned legacy base
  is proven by `scripts/compare-dist.cjs` (see Verification).
- **Runtime JS:** classic vanilla scripts in `src/scripts/`, referenced through
  `?url` and served hashed from `/_astro/`; vendor files in `src/vendor/`;
  stylesheets in `src/styles/`. The runtime configs stay at `/js/*-config.js`
  as endpoints.
- **Backend:** 4 TypeScript Yandex Cloud Functions in `functions/` (compiled to CommonJS): `lead-intake`, `fitbase-schedule`, `site-traffic`, `staging-authorizer`
- **CI:** `quality.yml` checks pull requests (lint, tests, `astro check`, production-like and staging builds, `compare-dist` against the pinned base). `main.yml` (**Release**) runs on every push to `main`: staging deploy → E2E from `zvenfit-autotests` → production deploy (functions → build → S3 → smoke) → release tag; production is skipped unless E2E passes. An emergency dispatch with `skip_staging` and a `reason` deploys production without staging. `staging.yml` re-runs staging and E2E manually without a release. All deploys share `_deploy-environment.yml` and the `deploy` concurrency group.

TypeScript is used for Cloud Functions, Astro frontmatter, endpoints and the
`src/lib` helpers; the browser scripts remain classic vanilla JS until the
post-migration revision.

## Source of truth

| Edit                                                       | Do not edit                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `src/` (pages, layouts, components, scripts, styles, data) | `dist/`, `.astro/`                                             |
| `scripts/` (checks, deploy, migration tooling)             | `public/**`, `scripts/snippets/**`, `scripts/*.config.json`, `scripts/build-static.cjs` — frozen, hotfix rule R10 only |
| `functions/`                                               | committed secrets                                              |

After any change in `src/`: run `npm run build` or use `npm run dev:astro`. A
legacy hotfix in `public/` is verified with the legacy pipeline
(`npm run dev:watch`) and lands through `main`.

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
  serve dist :4173   ← static site
```

Build injects API URLs into:

- `public/js/lead-config.js` → `window.ZVENFIT_LEAD_API`
- `public/js/schedule-config.js` → `window.ZVENFIT_SCHEDULE_API`
- `public/js/traffic-config.js` → `window.ZVENFIT_TRAFFIC_API`

## Build pipeline markers

`src/layouts/Base.astro` renders the shared document: head (bucket-hosted
normalize/webflow CSS, the site stylesheet, Webflow bootstrap, icons,
analytics, UTM, Open Graph, JSON-LD) and the body tail (jQuery, bucket
`webflow.js?v=ASSET_VERSION`, the page's own scripts in slot `scripts`, map
scripts, traffic beacon). **Whitespace in these templates is part of the
parity contract**: Prettier is disabled for `src/layouts`, `src/components`
and `src/pages`, do not reformat them.

| Component                                       | Purpose                                                           | Data                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Analytics.astro`                               | GTM + Top.Mail.Ru + Metrika, production only; `placement`, GTM comment style | raw legacy snippets in `src/components/analytics/`              |
| `UtmHead.astro`                                 | UTM attribution script (every mode)                               | `src/scripts/utm-attribution.js`                                 |
| `OpenGraph.astro`                               | OG/Twitter meta in the legacy order                               | page props, `scripts/structured-data.config.json`                |
| `StructuredData.astro`                          | JSON-LD graph                                                     | `src/lib/structured-data*.ts`, `scripts/structured-data.config.json` |
| `Menu.astro` + `LogoEmbeds.astro`               | `plain` menu variant (Webflow `menu3`); other variants in A2a     | page props                                                       |
| `Footer.astro` (`FooterDesktop`, `FooterMobile`) | `section-4`/`section-3` pair, Chekhova location                 | `src/lib/footer.ts`                                              |
| `MapRegion.astro`, `MapScripts.astro`           | runtime map region and scripts                                    | `scripts/maps.config.json`, `src/data/map-photos.json`           |
| `AppDownloadBadges/Platforms/Promo.astro`       | store badges and app sections                                     | `scripts/app-links.config.json`                                  |
| `TrafficBeacon.astro`                           | technical page views (not on 404)                                 | `src/scripts/traffic-beacon.js`                                  |

Endpoints in `src/pages`: `js/lead-config.js.ts`, `js/schedule-config.js.ts`,
`js/traffic-config.js.ts` read `LEAD_API_URL`, `SCHEDULE_API_URL`,
`TRAFFIC_API_URL` at build time (development falls back to the mock server,
staging and production fail without a value); `js/maps-config.js.ts` combines
`scripts/maps.config.json`, the committed photo snapshot and `Y_MAPS_API_KEY`;
`sitemap.xml.ts` collects `export const sitemap = { updated, changefreq,
priority }` from every page; `robots.txt.ts` serves
`src/data/robots.production.txt` or the staging `Disallow: /`. Content configs
stay in `scripts/*.config.json` until A2b moves them to `src/data/`.

Compiler facts to respect (details in the plan, section 4): comments passed as
component children are dropped, emit them via `set:html`; a raw `U+00A0` in a
template becomes a plain space, write `&nbsp;`; `{`/`}` in text are
expressions, escape them as `&#123;`/`&#125;`; every classic `<script>` needs
`is:inline`; component templates lose leading and trailing whitespace.

## Task → file map

| Task                       | Files                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Legal pages (Astro)        | `src/pages/offer/`, `src/pages/privacy/`, `src/pages/payment-policy/`                      |
| Page conversion            | `scripts/migrate/html-to-astro.cjs`, `scripts/migrate/manual.json`                         |
| Parity check               | `scripts/compare-dist.cjs`, `scripts/parity-allowlist.json`, `scripts/lib/html-parity.cjs` |
| Layout and shared blocks   | `src/layouts/Base.astro`, `src/components/`                                                 |
| Lead form UI/validation    | `public/forma-dlya-zayavki/index.html` (frozen until A2a), `src/scripts/lead-form.js`       |
| Lead API / Telegram        | `functions/lead-intake/src/handler.ts`, `src/telegram/`                                     |
| Lead storage / retry state | `functions/lead-intake/src/ydb/`                                                            |
| Schedule UI                | `public/raspisanie/index.html` (frozen until A2a), `src/scripts/schedule.js`                |
| Schedule API / Fitbase     | `functions/fitbase-schedule/src/handler.ts`, `src/adapters/fitbase/`                        |
| Technical site traffic     | `src/scripts/traffic-beacon.js`, `src/components/TrafficBeacon.astro`, `functions/site-traffic/src/` |
| UTM in leads               | `src/scripts/utm-attribution.js`, `docs/utm-attribution-marketing.md`                      |
| App store badges/links     | `scripts/app-links.config.json`, `src/components/AppDownload*.astro`                        |
| SEO / JSON-LD / Open Graph | `scripts/structured-data.config.json`, `src/lib/structured-data*.ts`, `src/components/OpenGraph.astro`, page props |
| Maps                       | `scripts/maps.config.json`, `src/data/map-photos.json` (`npm run maps:snapshot`), `src/scripts/yandex-map.js`, `src/components/MapRegion.astro` |
| Runtime API configs        | `src/pages/js/*-config.js.ts`, `src/lib/runtime-config.ts`                                  |
| Prices and page ownership  | `knowledge-base/site-information-architecture.md`                                           |
| Club card page             | `public/klubnaya-karta/` (frozen; ported by hand in A2a), `src/styles/klubnaya-karta.v1.css` |
| Global styles              | `src/styles/zvenfit.webflow.css`                                                            |
| Alerts / dashboard         | `scripts/monitoring.config.json`, `docs/monitoring.md`                                      |
| Staging access             | `functions/staging-authorizer/`, `docs/staging-environment.md`                              |
| Deploy                     | `.github/workflows/`, `scripts/deploy-*.sh`, `scripts/deploy.config.json`                  |

## Local development

```bash
cp .env.example .env.development   # fill values
npm install
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm ci --prefix functions/site-traffic
npm ci --prefix functions/staging-authorizer
npm run dev:astro                  # mock API :3000 + astro dev :4173 (converted pages)
```

- Node ≥ 22.23.4 (`.nvmrc`): Astro 7.4 refuses older releases; CI uses
  `setup-node` with `check-latest: true`.
- `astro dev --mode development` reads `.env.development`; the lead form posts to
  `http://localhost:3000` when `LEAD_API_URL` is empty.
- `npm run dev:watch` still builds the frozen legacy tree with
  `scripts/build-static.cjs` for verifying a hotfix in `public/`.
- Schedule uses dynamic fixture by default (`SCHEDULE_PROVIDER=fixture`)
- Live local data requires both `SCHEDULE_PROVIDER=fitbase` and `FITBASE_API_TOKEN`

## Verification

The Workspace check contract is `project-checks.json`. Run `python3 scripts/check.py --list` to review it; execute selected checks only with the returned `--execute-reviewed <review_digest>` and any required write/network flags. The runner does not provide OS sandboxing. Existing npm commands remain available below.

```bash
npm run check                    # astro check: types of components, props and endpoints
npm run build                    # must produce dist/ (NODE_ENV selects production, staging, development)
npm run lint                     # JS in public/, src/ (js, ts, astro) and all functions
npm run test:lead-fn             # durable storage, Telegram failure paths, metrics export deadline (needs openssl)
npm run test:schedule-fn         # schedule contract, Fitbase and synthetic adapters
npm run test:site-traffic        # page-view validation/classification/logging contract
npm run test:staging-authorizer  # staging Basic auth
npm run test:scripts             # build, deploy, monitoring, import, parity and converter scripts
npm run test:build               # astro check + build + check-routes + check-build (profile a1 in branch A1)
npm run test:build:staging       # protected staging build with the same guards
npm run compare:dist -- --base-sha <legacy SHA> --candidate-sha HEAD --profile a1 --mode production --snapshot src/data/map-photos.json
npm run compare:dist -- --base-sha <legacy SHA> --candidate-sha HEAD --profile a1 --mode staging --snapshot src/data/map-photos.json
npm run maps:snapshot            # refresh src/data/map-photos.json from Yandex Maps (network)
```

`compare:dist` builds both commits in disposable worktrees (`npm ci` inside) and
needs the network once; `HEAD` is accepted only as the candidate and only
locally — CI passes explicit SHAs. The partial profile `a1` exists only in
branch A1; deploy guards and the final pull request into `main` run the full
profile from `scripts/deploy.config.json`.
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
2. Copy-pasting footer/header into pages — use `Footer.astro`, `Menu.astro` and the other components; a block that does not fit the component contract goes to `scripts/migrate/manual.json` with a reason
3. Editing `public/**` for anything but a hotfix (decision R10) — the tree is frozen while branch A is open; new trainers, promos and texts wait for release A
4. Reformatting `src/layouts`, `src/components` or `src/pages` — the whitespace is part of the parity contract and `compare-dist` fails
5. Raw `U+00A0` or HTML comments inside component children in `.astro` templates — the compiler rewrites the first and drops the second; use `&nbsp;` and `set:html`
6. Breaking marker comments in the frozen legacy pages — the legacy build skips injection silently
7. Pushing to `main` — it starts a release (staging, E2E, then production); work on a branch and open a pull request. During branch A the stacked PRs target `feature/astro-release-a`

## Git branches

- Do not use the `codex/` prefix.
- Choose a semantic prefix: `feature/`, `bugfix/`, `hotfix/` (urgent production fix), `chore/`, `docs/`, or `refactor/`.
- Keep the rest short, lowercase and kebab-case, for example `bugfix/telegram-ipv4`.

## Pages

Converted pages: `src/pages/**/index.astro` (A1: `offer`, `privacy`,
`payment-policy`), each exporting `sitemap = { updated, changefreq, priority }`;
`src/pages/sitemap.xml.ts` and `robots.txt.ts` generate the crawl files, so
there is no hand-written sitemap for them. The remaining pages are the frozen
legacy export `public/**/index.html` plus `404.html`: home, service pages
(`personalnye-trenirovki`, `gruppovye-trenirovki`, `parnye-trenirovki`,
`pilates-na-reformere/*`, `trenazhernyj-zal/*`), `klubnaya-karta`,
`raspisanie`, `forma-dlya-zayavki`, `trenery/*` (index + one page per
trainer), `promos/*`, `contacts/platforms`; A2a converts them with
`scripts/migrate/html-to-astro.cjs --ref <legacy SHA>`.

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
