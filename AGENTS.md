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

- **Frontend:** static HTML in `public/`. The markup started as a Webflow export, but Webflow is no longer used: edit `public/` directly and never re-import a Webflow export over it.
- **Build:** `scripts/build-static.cjs` → `dist/` (gitignored)
- **Runtime JS:** vanilla JS in `public/js/`
- **Backend:** 4 TypeScript Yandex Cloud Functions in `functions/` (compiled to CommonJS): `lead-intake`, `fitbase-schedule`, `site-traffic`, `staging-authorizer`
- **CI:** `quality.yml` checks pull requests. `main.yml` (**Release**) runs on every push to `main`: staging deploy → E2E from `zvenfit-autotests` → production deploy (functions → build → S3 → smoke) → release tag; production is skipped unless E2E passes. An emergency dispatch with `skip_staging` and a `reason` deploys production without staging. `staging.yml` re-runs staging and E2E manually without a release. All deploys share `_deploy-environment.yml` and the `deploy` concurrency group.

TypeScript is used only for Cloud Functions; the frontend remains static vanilla JS. Do not assume React/Vite/Next.

## Source of truth

| Edit         | Do not edit                   |
| ------------ | ----------------------------- |
| `public/`    | `dist/`                       |
| `scripts/`   | generated `*.min.css` in dist |
| `functions/` | committed secrets             |

After any change that affects HTML/CSS/JS/config injection: run `npm run build` or use `npm run dev:watch`.

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

`build-static.cjs` replaces HTML comments with snippets/config. **Prefer editing snippets/config over duplicating HTML across pages.**

| Marker                                                | Source                                                 |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `<!-- ZvenFit: VK + Yandex Metrika -->`               | `scripts/snippets/analytics-head.html`                 |
| `<!-- ZvenFit: UTM attribution -->`                   | `scripts/snippets/utm-head.html`                       |
| `<!-- ZvenFit: structured-data -->`                   | `scripts/structured-data.config.json`                  |
| `<!-- ZvenFit: open-graph -->`                        | derived from page meta at build time                   |
| `<!-- ZvenFit: app-download-links-desktop/mobile -->` | `scripts/snippets/app-download-badges.html`            |
| `<!-- ZvenFit: app-download-platforms-section -->`    | `scripts/snippets/app-download-platforms-section.html` |
| `<!-- ZvenFit: app-download-promo-section -->`        | `scripts/snippets/app-download-promo-section.html`     |

Also at build time:

- minifies `zvenfit.webflow.css` → `zvenfit.webflow.min.css`
- cache-busts listed JS/CSS files via `ASSET_VERSION`
- writes `maps-config.js` from `maps.config.json` + structured data
- fetches Yandex Maps organization photos for the map panels (needs network; falls back to `locationPhotos` from `maps.config.json`). Production visitors see these build-time photos: the in-browser `ymaps.findOrganization` lookup currently fails

## Task → file map

| Task                       | Files                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Lead form UI/validation    | `public/forma-dlya-zayavki/index.html`, `public/js/lead-form.js`    |
| Lead API / Telegram        | `functions/lead-intake/src/handler.ts`, `src/telegram/`             |
| Lead storage / retry state | `functions/lead-intake/src/ydb/`                                    |
| Schedule UI                | `public/raspisanie/index.html`, `public/js/schedule.js`             |
| Schedule API / Fitbase     | `functions/fitbase-schedule/src/handler.ts`, `src/adapters/fitbase/` |
| Technical site traffic     | `public/js/traffic-beacon.js`, `functions/site-traffic/src/`        |
| UTM in leads               | `public/js/utm-attribution.js`, `docs/utm-attribution-marketing.md` |
| App store badges/links     | `scripts/app-links.config.json`, snippets in `scripts/snippets/`    |
| SEO / JSON-LD              | `scripts/structured-data.config.json`, page `<meta>`                |
| Maps                       | `scripts/maps.config.json`, `public/js/yandex-map.js`               |
| Prices and page ownership  | `knowledge-base/site-information-architecture.md`                   |
| Club card page             | `public/klubnaya-karta/`, `public/css/klubnaya-karta.v1.css`        |
| Global styles              | `public/css/zvenfit.webflow.css`                                    |
| Alerts / dashboard         | `scripts/monitoring.config.json`, `docs/monitoring.md`              |
| Staging access             | `functions/staging-authorizer/`, `docs/staging-environment.md`      |
| Deploy                     | `.github/workflows/`, `scripts/deploy-*.sh`                         |

## Local development

```bash
cp .env.example .env.development   # fill values
npm install
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm ci --prefix functions/site-traffic
npm ci --prefix functions/staging-authorizer
npm run dev:watch                  # mock API + rebuild + serve :4173
```

- Lead form posts to `http://localhost:3000` in dev (via injected `LEAD_API_URL`)
- Schedule uses dynamic fixture by default (`SCHEDULE_PROVIDER=fixture`)
- Live local data requires both `SCHEDULE_PROVIDER=fitbase` and `FITBASE_API_TOKEN`

## Verification

The Workspace check contract is `project-checks.json`. Run `python3 scripts/check.py --list` to review it; execute selected checks only with the returned `--execute-reviewed <review_digest>` and any required write/network flags. The runner does not provide OS sandboxing. Existing npm commands remain available below.

```bash
npm run build                    # must produce dist/
npm run lint                     # JS in public/ and all functions
npm run test:lead-fn             # durable storage / Telegram failure paths
npm run test:schedule-fn         # schedule contract, Fitbase and synthetic adapters
npm run test:site-traffic        # page-view validation/classification/logging contract
npm run test:staging-authorizer  # staging Basic auth
npm run test:scripts             # build, deploy, monitoring and import scripts
npm run test:build               # build + smoke check dist/
npm run test:build:staging       # protected staging build
```

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
2. Copy-pasting footer/header across every page — use snippets/markers
3. Forgetting `build-static` before deploy — app badges/OG/analytics missing
4. Breaking marker comments — build skips injection silently
5. Pushing to `main` — it starts a release (staging, E2E, then production); work on a branch and open a pull request

## Git branches

- Do not use the `codex/` prefix.
- Choose a semantic prefix: `feature/`, `bugfix/`, `hotfix/` (urgent production fix), `chore/`, `docs/`, or `refactor/`.
- Keep the rest short, lowercase and kebab-case, for example `bugfix/telegram-ipv4`.

## Pages

`public/**/index.html` plus `404.html`: home, service pages (`personalnye-trenirovki`, `gruppovye-trenirovki`, `parnye-trenirovki`, `pilates-na-reformere/*`, `trenazhernyj-zal/*`), `klubnaya-karta`, `raspisanie`, `forma-dlya-zayavki`, `trenery/*` (index + one page per trainer), `promos/*`, legal (`privacy`, `offer`, `payment-policy`), `contacts/platforms`. `public/sitemap.xml` lists every indexable page and is maintained by hand: update it when adding or removing a page.

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
| `docs/future/`                      | Ideas and discovery plans not approved for work yet |
| `knowledge-base/_index.md`          | Technical runbooks and page ownership               |
| `TODO.md`                           | UI/UX + infra backlog with priorities               |
