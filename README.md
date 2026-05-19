# ZvenFit Frontend

Static website с формой заявок → Telegram bot через Yandex Cloud Functions.

## Архитектура

```
┌─────────────┐
│   Browser   │
│ zvenfit.ru  │
└──────┬──────┘
       │ POST /forma-dlya-zayavki/
       │ (lead-form.js)
       ↓
┌──────────────────────────────┐
│  YC Cloud Function           │
│  https://functions.yc.net/.. │
│  (functions/telegram-lead/)  │
│  - TELEGRAM_BOT_TOKEN в env  │
│  - TELEGRAM_CHAT_ID в env    │
└──────┬───────────────────────┘
       │ api.telegram.org/bot.../sendMessage
       ↓
┌─────────────────┐
│ Telegram группа │
│ chat_id: -51... │
└─────────────────┘
```

**До:** токен бота светился в HTML → любой мог спамить.  
**После:** токен только в Cloud Function env, на фронте только URL функции.

## Файлы и зоны ответственности

### Cloud Function (бэкенд)

| Файл | Что делает |
|------|------------|
| `functions/telegram-lead/index.js` | Принимает POST с данными формы, валидирует, шлёт в Telegram |
| `functions/telegram-lead/package.json` | Метаданные функции (без зависимостей) |

**Env переменные функции:**
- `TELEGRAM_BOT_TOKEN` — секретный токен бота
- `TELEGRAM_CHAT_ID` — ID группы/лички для заявок
- `ALLOWED_ORIGINS` — CORS (откуда можно слать запросы)

### Frontend (статика)

| Файл | Что делает |
|------|------------|
| `public/forma-dlya-zayavki/index.html` | Форма заявки (имя, телефон, способ связи, username Telegram) |
| `public/js/lead-form.js` | Отправка формы на Cloud Function, показ success/error |
| `public/js/lead-config.js` | Одна строка: `window.ZVENFIT_LEAD_API = '...'` (подставляется при билде) |

### Билд и деплой

| Файл | Что делает |
|------|------------|
| `scripts/build-static.cjs` | Копирует `public/` → `dist/`, подставляет `LEAD_API_URL` в `lead-config.js` |
| `scripts/deploy-telegram-lead.sh` | Заливает функцию в YC через `yc serverless function` |
| `.github/workflows/main.yml` | CI: деплоит функцию → получает URL → собирает сайт → льёт в Object Storage |

### Документация

| Файл | О чём |
|------|-------|
| `docs/setup.md` | Быстрый старт: @BotFather, `yc init`, SA, GitHub Actions |

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

`.env.example` (не коммитить реальный `.env`):

```bash
# Build
LEAD_API_URL=https://functions.yandexcloud.net/...

# Object Storage deploy (local)
YC_S3_BUCKET=zvenfit-frontend
YC_ACCESS_KEY_ID=
YC_SECRET_ACCESS_KEY=

# Cloud Function deploy (local)
YC_FOLDER_ID=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## TODO

- [ ] Добавить Turnstile/reCAPTCHA для защиты от спама
- [ ] Логирование заявок (Cloud Logging или отдельная таблица)
- [ ] Webhook вместо polling для bot updates (если будет интерактив)
- [ ] Metrics: количество заявок/день (YC Monitoring)
