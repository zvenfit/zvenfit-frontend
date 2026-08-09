# ZvenFit Frontend

Static website (Webflow HTML) + build pipeline + 2 Yandex Cloud Functions + YDB Serverless.

**Agent / contributor guide:** [`AGENTS.md`](AGENTS.md)  
**Backlog:** [`TODO.md`](TODO.md)

## Архитектура

```
┌─────────────┐
│   Browser   │
│ zvenfit.ru  │
└──────┬──────┘
       │
       ├─ POST lead form (lead-form.js)
       │      ↓
       │  functions/telegram-lead → YDB (source of truth)
       │                           └→ Telegram notification
       │                               ↑ retry timer
       │
       └─ GET /raspisanie/ (schedule.js)
              ↓
          functions/fitbase-schedule → Fitbase API
```

Build (`scripts/build-static.cjs`) копирует `public/` → `dist/`, инжектит snippets, API URLs, OG/JSON-LD.

**Lead:** форма получает успех после сохранения в YDB. Telegram — уведомление; при его сбое заявка
остаётся в таблице и повторно отправляется таймером. Токен бота находится только в Cloud Function env.

## Файлы и зоны ответственности

### Cloud Functions (бэкенд)

| Файл                                    | Что делает                                            |
| --------------------------------------- | ----------------------------------------------------- |
| `functions/telegram-lead/index.js`      | Точка входа Cloud Function, реэкспорт из `handler.js` |
| `functions/telegram-lead/handler.js`    | POST формы, идемпотентность, Telegram и retry timer   |
| `functions/telegram-lead/lead-store.js` | YDB: таблица лидов, TTL, lease и статусы доставки     |
| `functions/telegram-lead/logger.js`     | Pino: structured logs, request ID и PII redaction     |
| `functions/telegram-lead/lead-migrations.js` | Версионированная схема YDB и индекс очереди       |
| `functions/telegram-lead/ydb-observability.js` | YDB latency, retries и безопасные error codes |
| `functions/fitbase-schedule/index.js`   | Точка входа Cloud Function, реэкспорт из `handler.js` |
| `functions/fitbase-schedule/handler.js` | GET расписания → Fitbase API v2                       |
| `functions/fitbase-schedule/logger.js`  | Pino: structured logs, request ID и PII redaction     |

**telegram-lead env:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ALLOWED_ORIGINS`,
`YDB_CONNECTION_STRING`, `YDB_LEADS_TABLE`, `LEAD_RETENTION_DAYS`, `MAX_TELEGRAM_ATTEMPTS`
**fitbase-schedule env:** `FITBASE_API_TOKEN`, `FITBASE_DOMAIN`, `FITBASE_CLUB_ID`, `ALLOWED_ORIGINS`

### Frontend (статика)

| Файл                                   | Что делает                                                   |
| -------------------------------------- | ------------------------------------------------------------ |
| `public/forma-dlya-zayavki/index.html` | Форма заявки (имя, телефон, способ связи, username Telegram) |
| `public/js/lead-form.js`               | Отправка формы на Cloud Function, показ success/error        |
| `public/js/lead-config.js`             | `window.ZVENFIT_LEAD_API` (подставляется при билде)          |
| `public/raspisanie/index.html`         | Страница расписания                                          |
| `public/js/schedule.js`                | UI расписания, запросы к schedule API                        |
| `public/js/schedule-config.js`         | `window.ZVENFIT_SCHEDULE_API` (подставляется при билде)      |

### Билд и деплой

| Файл                                 | Что делает                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `scripts/build-static.cjs`           | Копирует `public/` → `dist/`, подставляет `LEAD_API_URL` в `lead-config.js` |
| `scripts/deploy-telegram-lead.sh`    | Создаёт YDB при необходимости, деплоит функцию и retry timer                |
| `scripts/import-telegram-leads.cjs`  | Dry-run и идемпотентный импорт старых Telegram-заявок в YDB                 |
| `scripts/deploy-fitbase-schedule.sh` | Deploy schedule function                                                    |
| `mock-server.js`                     | Local API :3000 (lead POST + schedule GET)                                  |
| `.github/workflows/main.yml`         | CI: deploy both functions → build → S3                                      |

### Документация

| Файл                                | О чём                                                    |
| ----------------------------------- | -------------------------------------------------------- |
| `AGENTS.md`                         | Guide для AI-агента: архитектура, markers, task map      |
| `docs/setup.md`                     | Быстрый старт: @BotFather, `yc init`, SA, GitHub Actions |
| `docs/utm-attribution-marketing.md` | UTM для маркетинга                                       |

### Сообщения не приходят в Telegram

**Проверь:**

```bash
# 1. Бот в группе?
# 2. Токен правильный?
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
# Ответ: {"ok":true, "result": {...}}

# 3. chat_id правильный?
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID&text=test"
```

### GitHub Actions fail

**deploy-function:**

- `Authentication failed` → проверь `YC_SA_JSON_KEY` (валидный JSON?)
- `Permission denied` → проверь роли Cloud Functions, Triggers и YDB по [`docs/setup.md`](docs/setup.md)
- `Failed to get function URL` → функция создалась? Проверь консоль YC

**deploy-site:**

- `Upload files failed` → проверь `YC_ACCESS_KEY_ID` / `YC_SECRET_ACCESS_KEY`
- CORS error → `ALLOWED_ORIGINS` в `main.yml` env

## Monitoring

Cloud Functions пишут структурированные события об ошибках YDB, Telegram и
Fitbase через Pino без персональных данных. Селекторы для Monium, production-алерты,
каналы уведомлений, дашборд и оценка стоимости описаны в
[`docs/monitoring.md`](docs/monitoring.md).

## Env variables

Скопируй `.env.example` → `.env.development` (gitignored). См. комментарии в файле.

## Local dev

```bash
npm install
npm run dev:watch   # mock API :3000 + rebuild + site :4173
npm run test:lead-fn
npm run test:schedule-fn
npm run lint:public
npm run test:build
```

## Backlog

См. [`TODO.md`](TODO.md) — UI/a11y, infra, pre-release checklist.
