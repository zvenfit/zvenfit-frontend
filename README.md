# ZvenFit Frontend

Static website (Webflow HTML) + build pipeline + 2 Yandex Cloud Functions.

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
       │  functions/telegram-lead → Telegram
       │
       └─ GET /raspisanie/ (schedule.js)
              ↓
          functions/fitbase-schedule → Fitbase API
```

Build (`scripts/build-static.cjs`) копирует `public/` → `dist/`, инжектит snippets, API URLs, OG/JSON-LD.

**Lead:** токен бота только в Cloud Function env, на фронте — URL функции.

## Файлы и зоны ответственности

### Cloud Functions (бэкенд)

| Файл | Что делает |
|------|------------|
| `functions/telegram-lead/index.js` | POST формы → Telegram |
| `functions/fitbase-schedule/index.js` | GET расписания → Fitbase API v2 |

**telegram-lead env:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ALLOWED_ORIGINS`  
**fitbase-schedule env:** `FITBASE_API_TOKEN`, `FITBASE_DOMAIN`, `FITBASE_CLUB_ID`, `ALLOWED_ORIGINS`

### Frontend (статика)

| Файл | Что делает |
|------|------------|
| `public/forma-dlya-zayavki/index.html` | Форма заявки (имя, телефон, способ связи, username Telegram) |
| `public/js/lead-form.js` | Отправка формы на Cloud Function, показ success/error |
| `public/js/lead-config.js` | `window.ZVENFIT_LEAD_API` (подставляется при билде) |
| `public/raspisanie/index.html` | Страница расписания |
| `public/js/schedule.js` | UI расписания, запросы к schedule API |
| `public/js/schedule-config.js` | `window.ZVENFIT_SCHEDULE_API` (подставляется при билде) |

### Билд и деплой

| Файл | Что делает |
|------|------------|
| `scripts/build-static.cjs` | Копирует `public/` → `dist/`, подставляет `LEAD_API_URL` в `lead-config.js` |
| `scripts/deploy-telegram-lead.sh` | Deploy lead function |
| `scripts/deploy-fitbase-schedule.sh` | Deploy schedule function |
| `mock-server.js` | Local API :3000 (lead POST + schedule GET) |
| `.github/workflows/main.yml` | CI: deploy both functions → build → S3 |

### Документация

| Файл | О чём |
|------|-------|
| `AGENTS.md` | Guide для AI-агента: архитектура, markers, task map |
| `docs/setup.md` | Быстрый старт: @BotFather, `yc init`, SA, GitHub Actions |
| `docs/utm-attribution-marketing.md` | UTM для маркетинга |

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
- `Permission denied` → роль `serverless.functions.admin` на SA
- `Failed to get function URL` → функция создалась? Проверь консоль YC

**deploy-site:**
- `Upload files failed` → проверь `YC_ACCESS_KEY_ID` / `YC_SECRET_ACCESS_KEY`
- CORS error → `ALLOWED_ORIGINS` в `main.yml` env

## Env variables

Скопируй `.env.example` → `.env.development` (gitignored). См. комментарии в файле.

## Local dev

```bash
npm install
npm run dev:watch   # mock API :3000 + rebuild + site :4173
npm run lint:public
npm run test:build
```

## Backlog

См. [`TODO.md`](TODO.md) — UI/a11y, infra, pre-release checklist.
