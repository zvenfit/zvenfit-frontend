# ZvenFit Frontend

Статический сайт ZvenFit из Webflow-экспорта, serverless-функции и надёжное хранение заявок в YDB Serverless.

- Инструкции для контрибьюторов и AI-агентов: [`AGENTS.md`](AGENTS.md)
- Проектная база знаний: [`knowledge-base/_index.md`](knowledge-base/_index.md)
- Текущий backlog: [`TODO.md`](TODO.md)
- Полная настройка инфраструктуры: [`docs/setup.md`](docs/setup.md)
- Границы backend-слоёв и артефактов: [`docs/backend-architecture.md`](docs/backend-architecture.md)
- Повторяемый production release checklist: [`docs/launch-checklist.md`](docs/launch-checklist.md)

## Быстрый старт

```bash
cp .env.example .env.development
npm install
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm ci --prefix functions/site-traffic
npm ci --prefix functions/staging-authorizer
npm run dev:watch
```

Локально сайт открывается на `http://localhost:4173`, mock API — на `http://localhost:3000`.
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

## Где менять код

| Зона                      | Источник                                               |
| ------------------------- | ------------------------------------------------------ |
| Статические страницы      | `public/`                                              |
| Lead form                 | `public/forma-dlya-zayavki/`, `public/js/lead-form.js` |
| Расписание                | `public/raspisanie/`, `public/js/schedule.js`          |
| Lead API / YDB / Telegram | `functions/lead-intake/src/`                           |
| Fitbase API               | `functions/fitbase-schedule/src/`                      |
| Staging Basic authorizer  | `functions/staging-authorizer/src/`                    |
| Техническая посещаемость  | `public/js/traffic-beacon.js`, `functions/site-traffic/` |
| Build и HTML-инъекции     | `scripts/build-static.cjs`, `scripts/snippets/`        |
| Production workflow       | `.github/workflows/main.yml`                           |
| Private staging workflow  | `.github/workflows/staging.yml`                        |

Staging Playwright tests and their fail-closed config live in
[`zvenfit-autotests`](https://github.com/zvenfit/zvenfit-autotests). The
frontend staging workflow calls that repository's reusable workflow at an
immutable commit SHA after deploy.

`dist/` генерируется и не редактируется вручную. После изменений HTML, CSS, JS или build-конфигурации запускай `npm run build` либо используй `npm run dev:watch`.

## Проверки

```bash
npm run lint:public
npm run test:lead-fn
npm run test:schedule-fn
npm run test:staging-authorizer
npm run test:site-traffic
npm run test:monitoring
npm run test:lead-import
npm run test:build
npm run test:build:staging
```

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
| [`docs/future/README.md`](docs/future/README.md)                         | Несогласованные будущие инициативы и discovery-планы                                |

`knowledge-base/` хранится вместе с кодом и может публиковаться только в Git-репозиторий этого проекта. Её нельзя синхронизировать с Wiki, DataCatalog или другой внешней базой знаний. Перед коммитом в ней не должно быть секретов, персональных данных, реальных `.env*` или ключей сервисных аккаунтов.
