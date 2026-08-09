# Agent guide — ZvenFit Frontend

Краткий контракт для AI-агента и новых контрибьюторов. Полный backlog: [`TODO.md`](TODO.md).

## Project-specific agent rule

- Do not use Stefania, its skills, Wiki, knowledge base, memory, or related workflows for this project.
- Work only with the repository and task-specific tools explicitly requested by the user.

## Stack

- **Frontend:** static HTML (Webflow export) in `public/`
- **Build:** `scripts/build-static.cjs` → `dist/` (gitignored)
- **Runtime JS:** vanilla JS in `public/js/`
- **Backend:** 2 Yandex Cloud Functions in `functions/`
- **CI:** `.github/workflows/main.yml` — deploy functions → build → S3

There is almost no TypeScript (`src/` holds types only). Do not assume React/Vite/Next.

## Source of truth

| Edit         | Do not edit                   |
| ------------ | ----------------------------- |
| `public/`    | `dist/`                       |
| `scripts/`   | generated `*.min.css` in dist |
| `functions/` | committed secrets             |

After any change that affects HTML/CSS/JS/config injection: run `npm run build` or use `npm run dev:watch`.

## Module conventions

- Keep `index.js` files as entrypoints with re-exports only; implementation belongs in named modules such as `handler.js`.
- Keep tests in a sibling `__tests__/` directory and name them after the module they cover.

## Architecture

```
Browser (zvenfit.ru)
  ├─ POST lead form → functions/telegram-lead → YDB → Telegram
  │                                      ↑ retry timer
  └─ GET /raspisanie/ → functions/fitbase-schedule → Fitbase API

Local dev (npm run dev):
  mock-server :3000  ← lead POST + GET /schedule
  serve dist :4173   ← static site
```

Build injects API URLs into:

- `public/js/lead-config.js` → `window.ZVENFIT_LEAD_API`
- `public/js/schedule-config.js` → `window.ZVENFIT_SCHEDULE_API`

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
| Lead API / Telegram        | `functions/telegram-lead/handler.js`                                |
| Lead storage / retry state | `functions/telegram-lead/lead-store.js`                             |
| Schedule UI                | `public/raspisanie/index.html`, `public/js/schedule.js`             |
| Schedule API / Fitbase     | `functions/fitbase-schedule/handler.js`                             |
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
npm run dev:watch                  # mock API + rebuild + serve :4173
```

- Lead form posts to `http://localhost:3000` in dev (via injected `LEAD_API_URL`)
- Schedule uses fixture unless `FITBASE_API_TOKEN` is set in `.env.development`
- Force fixture: `USE_SCHEDULE_FIXTURE=1`

## Verification

```bash
npm run build          # must produce dist/
npm run lint:public    # JS in public/ and functions/
npm run test:lead-fn   # durable storage / Telegram failure paths
npm run test:build     # build + smoke check dist/index.html
```

Manual smoke:

- `/forma-dlya-zayavki/` — submit form, check mock-server log
- `/raspisanie/` — schedule renders

## Secrets & security

- Never commit tokens, SA keys, or real `.env*`
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
