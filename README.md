# ZvenFit Frontend

Статический сайт ZvenFit, serverless-функции и надёжное хранение заявок в YDB Serverless.
Сайт собирается Astro в статический `dist/`: страницы в `src/pages`, общая разметка в
`src/layouts` и `src/components`, данные в `src/content` и `src/data`. Разметка
изначально пришла из Webflow-экспорта; релиз A переносит её в Astro со строгим паритетом
([план](docs/astro-migration.md), ветка `feature/astro-release-a`). После этапа A1 в Astro
живут юридические страницы, остальные ждут A2a в замороженном `public/`.

- Инструкции для контрибьюторов и AI-агентов: [`AGENTS.md`](AGENTS.md)
- Связь с Personal AI Workspace и запуск проверок: [`docs/personal-ai-workspace.md`](docs/personal-ai-workspace.md)
- Техническая база знаний: [`knowledge-base/_index.md`](knowledge-base/_index.md)
- Текущий backlog: [`TODO.md`](TODO.md)
- Полная настройка инфраструктуры: [`docs/setup.md`](docs/setup.md)
- Границы backend-слоёв и артефактов: [`docs/backend-architecture.md`](docs/backend-architecture.md)
- Повторяемый production release checklist: [`docs/launch-checklist.md`](docs/launch-checklist.md)

По правилам Personal AI Workspace бизнес-контекст, цели продукта, проектные планы
и статусы ведутся в его `vault/`. Код и техническая документация остаются в этом
репозитории. Между карточками Workspace и документацией используются ссылки;
копировать базу знаний при подключении проекта не нужно. Правила доступа к
контексту и локальному bridge описаны в [`AGENTS.md`](AGENTS.md).

## Быстрый старт

```bash
cp .env.example .env.development
npm install
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm ci --prefix functions/site-traffic
npm ci --prefix functions/staging-authorizer
npm run dev:astro
```

Нужен Node ≥ 22.23.4 (`.nvmrc`). Локально Astro dev открывается на `http://localhost:4173`,
mock API — на `http://localhost:3000`; `npm run dev:watch` по-прежнему собирает замороженный
legacy-экспорт `public/` для проверки hotfix.
Локальный mock-server использует staging-артефакт с динамическими синтетическими данными. Для live Fitbase локально
явно задай `SCHEDULE_PROVIDER=fitbase` и `FITBASE_API_TOKEN` в `.env.development`; этот переключатель существует
только в локальном сервере и не попадает в cloud runtime.

## Архитектура

```text
Browser (zvenfit.ru) → public production functions

Browser / Playwright (suite: zvenfit-autotests)
  └─ staging.zvenfit.ru (Basic-auth API Gateway)
       ├─ private Object Storage
       ├─ private lead-intake → staging YDB → fixture notification sink
       │                           ↑ bootstrap-only retry timer
       └─ private fitbase-schedule → dynamic fixture

Cloud Functions собираются из отдельных composition roots. Production-артефакты содержат Telegram/Fitbase
адаптеры, staging-артефакты — только staging sink/fixtures; runtime-переключателей между ними нет.

Browser page-view beacon → stateless site-traffic function → Cloud Logging → Monium

Local development
  ├─ mock-server :3000
  └─ static site :4173
```

Заявка считается принятой после сохранения в YDB. Telegram служит каналом уведомления: при временном сбое retry timer повторит доставку сохранённой заявки.

Релиз: каждый push в `main` запускает workflow **Release**. Он разворачивает
staging, прогоняет E2E из `zvenfit-autotests` и только после их успеха деплоит
production и публикует тег версии. Подробности и аварийный путь — в
[`docs/launch-checklist.md`](docs/launch-checklist.md).

## Где менять код

| Зона                      | Источник                                               |
| ------------------------- | ------------------------------------------------------ |
| Страницы Astro (A1: оферта, конфиденциальность, оплата) | `src/pages/`             |
| Общая разметка            | `src/layouts/Base.astro`, `src/components/`             |
| Остальные страницы до A2a | `public/` (заморожен, только hotfix по решению R10)      |
| Lead form                 | `public/forma-dlya-zayavki/` (до A2a), `src/scripts/lead-form.js` |
| Расписание                | `public/raspisanie/` (до A2a), `src/scripts/schedule.js` |
| Lead API / YDB / Telegram | `functions/lead-intake/src/`                           |
| Fitbase API               | `functions/fitbase-schedule/src/`                      |
| Staging Basic authorizer  | `functions/staging-authorizer/src/`                    |
| Техническая посещаемость  | `src/scripts/traffic-beacon.js`, `functions/site-traffic/` |
| Сборка и эндпоинты конфигов | `astro.config.mjs`, `src/pages/js/*-config.js.ts`, `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts` |
| Конвертер и паритет       | `scripts/migrate/`, `scripts/compare-dist.cjs`, `scripts/parity-allowlist.json` |
| Release: staging → E2E → production | `.github/workflows/main.yml`                 |
| Ручной staging + E2E без релиза     | `.github/workflows/staging.yml`              |

Staging Playwright tests and their fail-closed config live in
[`zvenfit-autotests`](https://github.com/zvenfit/zvenfit-autotests). Both
frontend deploy workflows call that repository's reusable workflow at the same
immutable commit SHA after the staging deploy.

`dist/` генерируется и не редактируется вручную. После изменений в `src/` запускай `npm run build`
(режим берётся из `NODE_ENV`: production, staging, development) либо используй `npm run dev:astro`.
Шаблоны в `src/layouts`, `src/components` и `src/pages` воспроизводят пробелы legacy-разметки
байт в байт: их не форматируют, иначе падает `compare:dist`.

## Проверки

```bash
npm run check
npm run lint
npm run test:lead-fn
npm run test:schedule-fn
npm run test:staging-authorizer
npm run test:site-traffic
npm run test:scripts
npm run test:build
npm run test:build:staging
```

`test:scripts` покрывает все тесты `scripts/__tests__/`; `test:monitoring` и
`test:lead-import` запускают их подмножества. Паритет с закреплённой legacy-базой
проверяет `npm run compare:dist -- --base-sha <SHA> --candidate-sha HEAD --profile a1 --mode production --snapshot src/data/map-photos.json`
(и то же с `--mode staging`); в CI это job `compare-dist` с явными SHA.

После production deploy выполни smoke-test. Он проверяет страницы,
runtime-конфиги, CORS lead API, schedule API и пишет один page view класса
`synthetic`; форму он не отправляет и заявку не создаёт:

```bash
npm run smoke:production
```

## Документация

| Файл                                                                     | Назначение                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [`docs/setup.md`](docs/setup.md)                                         | Yandex Cloud, YDB, Telegram, GitHub Secrets, локальная разработка и troubleshooting |
| [`docs/launch-checklist.md`](docs/launch-checklist.md)                   | Повторяемая проверка каждого production-релиза                                      |
| [`docs/monitoring.md`](docs/monitoring.md)                               | Логи, метрики, алерты, dashboard и synthetic tests                                  |
| [`docs/monitoring-operations.md`](docs/monitoring-operations.md)         | Договорённости, ссылки, готовые log-селекторы и incident runbook                     |
| [`docs/site-traffic-analytics.md`](docs/site-traffic-analytics.md)       | Stateless page views, traffic classes и dashboard Monium                            |
| [`docs/utm-attribution-marketing.md`](docs/utm-attribution-marketing.md) | UTM-разметка для маркетинга                                                         |
| [`docs/astro-migration.md`](docs/astro-migration.md)                     | Миграция на Astro: инварианты, этапы, контракт паритета, откат                      |
| [`docs/future/README.md`](docs/future/README.md)                         | Несогласованные будущие инициативы и discovery-планы                                |

`knowledge-base/` хранится вместе с кодом и может публиковаться только в Git-репозиторий этого проекта. Её нельзя синхронизировать с Wiki, DataCatalog или другой внешней базой знаний. Перед коммитом в ней не должно быть секретов, персональных данных, реальных `.env*` или ключей сервисных аккаунтов.
