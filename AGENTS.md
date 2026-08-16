# Agent guide — ZvenFit Frontend

Краткий контракт для AI-агента и новых контрибьюторов. Полный backlog: [`TODO.md`](TODO.md).

## Project-specific agent rule

- Use only the project-local knowledge base in `knowledge-base/`.
- The project-local knowledge base is version-controlled documentation: it may be staged, committed, and pushed only to this repository's configured Git remote after checking that it contains no secrets or personal data.
- Do not use Stefania Wiki, DataCatalog, remote knowledge-base adapters, cross-project memory, or knowledge-base sync workflows for this project.
- Do not synchronize, upload, or copy `knowledge-base/` to a separate knowledge-base surface; Git for this project is its only remote storage.
- Work only with the repository and task-specific tools explicitly requested by the user.

## Cross-repository test ownership

- `zvenfit-autotests` is the only repository that owns Playwright, browser E2E specs, Playwright configs, fixtures, and reusable browser-test workflows.
- Never add `@playwright/test`, `playwright`, `playwright-core`, `playwright*.config.*`, or browser E2E source files to `zvenfit-frontend`.
- This repository may own unit, integration, build, deployment, and static contract tests. Its staging workflow may only call the reusable E2E workflow from `zvenfit-autotests`.
- Pin both the cross-repository reusable workflow reference and its checkout input to the same full immutable commit SHA.
- Publish and validate browser-test changes in `zvenfit-autotests` first; only then update the pinned SHA here.
- If a task asks to add Playwright or browser E2E while working in this repository, implement that part in `zvenfit-autotests` instead of crossing the boundary.

## Stack

- **Frontend:** static HTML (Webflow export) in `public/`
- **Build:** `scripts/build-static.cjs` → `dist/` (gitignored)
- **Runtime JS:** vanilla JS in `public/js/`
- **Backend:** 3 TypeScript Yandex Cloud Functions in `functions/` (compiled to CommonJS)
- **CI:** `.github/workflows/main.yml` — deploy functions → build → S3

TypeScript is used for Cloud Functions and declarations in `src/`; the frontend remains static vanilla JS. Do not assume React/Vite/Next.

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
- cache-busts listed JS files via `ASSET_VERSION`
- writes `maps-config.js` from `maps.config.json` + structured data
- optional Yandex Maps org photos fetch (needs network)

## Task → file map

| Task                       | Files                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Lead form UI/validation    | `public/forma-dlya-zayavki/index.html`, `public/js/lead-form.js`    |
| Lead API / Telegram        | `functions/lead-intake/src/handler.ts`, `src/telegram/`             |
| Lead storage / retry state | `functions/lead-intake/src/ydb/`                                    |
| Schedule UI                | `public/raspisanie/index.html`, `public/js/schedule.js`             |
| Schedule API / Fitbase     | `functions/fitbase-schedule/src/handler.ts`, `src/fitbase/`         |
| Technical site traffic     | `public/js/traffic-beacon.js`, `functions/site-traffic/src/`        |
| UTM in leads               | `public/js/utm-attribution.js`, `docs/utm-attribution-marketing.md` |
| App store badges/links     | `scripts/app-links.config.json`, snippets in `scripts/snippets/`    |
| SEO / JSON-LD              | `scripts/structured-data.config.json`, page `<meta>`                |
| Maps                       | `scripts/maps.config.json`, `public/js/yandex-map.js`               |
| Global styles              | `public/css/zvenfit.webflow.css`                                    |
| Deploy                     | `.github/workflows/main.yml`, `scripts/deploy-*.sh`                 |

## Local development

```bash
cp .env.example .env.development   # fill values
npm install
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm ci --prefix functions/site-traffic
npm run dev:watch                  # mock API + rebuild + serve :4173
```

- Lead form posts to `http://localhost:3000` in dev (via injected `LEAD_API_URL`)
- Schedule uses dynamic fixture by default (`SCHEDULE_PROVIDER=fixture`)
- Live local data requires both `SCHEDULE_PROVIDER=fitbase` and `FITBASE_API_TOKEN`

## Verification

```bash
npm run build          # must produce dist/
npm run lint:public    # JS in public/ and functions/
npm run test:lead-fn   # durable storage / Telegram failure paths
npm run test:site-traffic  # page-view validation/classification/logging contract
npm run test:build     # build + smoke check dist/index.html
```

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
2. Copy-pasting footer/header across 26 HTML files — use snippets/markers
3. Forgetting `build-static` before deploy — app badges/OG/analytics missing
4. Breaking marker comments — build skips injection silently
5. Running `lint` only — default `lint` targets empty `src/`, use `lint:public`

## Pages (26 HTML files)

`index.html`, service pages (`personalnye-trenirovki`, `gruppovye-trenirovki`, `parnye-trenirovki`, `pilates-na-reformere/*`, `trenazhernyj-zal/*`), `raspisanie`, `forma-dlya-zayavki`, `trenery/*` (8 trainers), `promos/*`, legal (`privacy`, `offer`, `payment-policy`), `contacts/platforms`, `404.html`.

## Docs index

| File                                | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `README.md`                         | Architecture, deploy, troubleshooting |
| `docs/setup.md`                     | YC + Telegram + GitHub Secrets setup  |
| `docs/utm-attribution-marketing.md` | UTM for marketing team                |
| `TODO.md`                           | UI/UX + infra backlog with priorities |
