# ZvenFit Frontend

Статический сайт ZvenFit из Webflow-экспорта, две Yandex Cloud Functions и надёжное хранение заявок в YDB Serverless.

- Инструкции для контрибьюторов и AI-агентов: [`AGENTS.md`](AGENTS.md)
- Текущий backlog: [`TODO.md`](TODO.md)
- Полная настройка инфраструктуры: [`docs/setup.md`](docs/setup.md)
- Повторяемый production release checklist: [`docs/launch-checklist.md`](docs/launch-checklist.md)

## Быстрый старт

```bash
cp .env.example .env.development
npm install
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm run dev:watch
```

Локально сайт открывается на `http://localhost:4173`, mock API — на `http://localhost:3000`.
Расписание использует динамический `fixture`, не зависящий от календарной даты. Для live Fitbase локально явно
задай `SCHEDULE_PROVIDER=fitbase` и `FITBASE_API_TOKEN` в `.env.development`.

## Архитектура

```text
Browser (zvenfit.ru / staging.zvenfit.ru)
  ├─ POST lead form → lead-intake → YDB → Telegram
  │                                  ↑ retry timer
  └─ GET /raspisanie/ → fitbase-schedule → provider
                                             ├─ production: Fitbase API
                                             └─ staging: dynamic fixture

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
| Build и HTML-инъекции     | `scripts/build-static.cjs`, `scripts/snippets/`        |
| Production workflow       | `.github/workflows/main.yml`                           |

`dist/` генерируется и не редактируется вручную. После изменений HTML, CSS, JS или build-конфигурации запускай `npm run build` либо используй `npm run dev:watch`.

## Проверки

```bash
npm run lint:public
npm run test:lead-fn
npm run test:schedule-fn
npm run test:monitoring
npm run test:lead-import
npm run test:build
```

После production deploy выполни read-only smoke-test. Он проверяет страницы, runtime-конфиги, CORS lead API и ответ schedule API, но не отправляет форму и не создаёт заявку:

```bash
npm run smoke:production
```

## Документация

| Файл                                                                     | Назначение                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [`docs/setup.md`](docs/setup.md)                                         | Yandex Cloud, YDB, Telegram, GitHub Secrets, локальная разработка и troubleshooting |
| [`docs/launch-checklist.md`](docs/launch-checklist.md)                   | Повторяемая проверка каждого production-релиза                                      |
| [`docs/monitoring.md`](docs/monitoring.md)                               | Логи, метрики, алерты, dashboard и synthetic tests                                  |
| [`docs/utm-attribution-marketing.md`](docs/utm-attribution-marketing.md) | UTM-разметка для маркетинга                                                         |

Секреты, реальные `.env*`, ключи сервисных аккаунтов и содержимое `knowledge-base/` нельзя коммитить или отправлять во внешние системы.
