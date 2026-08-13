# Setup: Telegram Bot + YDB + Yandex Cloud

Автоматический деплой Cloud Function с надёжным хранением заявок в YDB.

## Архитектура

```
Форма → Cloud Function → YDB (источник истины) → Telegram
                      ↑                         ↗
                      └──── retry timer ───────┘
```

**Один workflow** деплоит и функцию, и сайт последовательно.

---

## Быстрый старт

### 1. Telegram

```bash
# @BotFather → /newbot (или /revoke если токен был в git)
# Скопируй токен бота

# Добавь бота в группу, получи chat_id:
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
# Найди chat.id (отрицательное число)
```

### 2. Yandex Cloud CLI

```bash
# Установка
curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
exec -l $SHELL

# Авторизация
yc init  # выбери folder

# Запомни folder ID
yc config get folder-id  # b1g...
```

### 3. Service Account

```bash
export YC_FOLDER_ID=$(yc config get folder-id)
export SA_NAME=zvenfit-ci-sa

# Создать SA
yc iam service-account create --name $SA_NAME

# Дать роли
SA_ID=$(yc iam service-account get --name $SA_NAME --format json | jq -r '.id')

yc resource-manager folder add-access-binding \
  --id $YC_FOLDER_ID \
  --role functions.editor \
  --service-account-id $SA_ID

# Создать авторизованный ключ
yc iam key create \
  --service-account-name $SA_NAME \
  --output sa-key.json

# Скопировать весь JSON
cat sa-key.json

# Удалить после добавления в GitHub
rm sa-key.json
```

### 4. GitHub Secrets

**Settings → Secrets and variables → Actions:**

Deployment использует GitHub Environments. Production jobs выбирают environment
`production`, staging jobs — `staging`. Одинаковое имя секрета в этих
environments должно содержать разные значения. Не копируй production Telegram,
YDB, folder или Object Storage credentials в staging.

Repository-level production secrets продолжают передаваться в reusable workflow
через `secrets: inherit`, поэтому переход не требует одномоментной миграции.
Environment secret с тем же именем имеет приоритет. Целевое состояние — хранить
deployment secrets в соответствующем GitHub Environment.

| Secret                   | Откуда                     | Пример                                     |
| ------------------------ | -------------------------- | ------------------------------------------ |
| `YC_SA_JSON_KEY`         | `sa-key.json` целиком      | `{"id":"aje...","service_account_id":...}` |
| `YC_FOLDER_ID`           | `yc config get folder-id`  | `b1g...`                                   |
| `TELEGRAM_BOT_TOKEN`     | @BotFather                 | `123456:ABC...`                            |
| `TELEGRAM_CHAT_ID`       | getUpdates                 | `-5161525132`                              |
| `LEAD_RATE_LIMIT_SECRET` | `openssl rand -hex 32`     | Случайная строка для HMAC IP               |
| `MONIUM_API_KEY`         | Scoped API key runtime SA  | OTLP-запись метрик в Monium                |
| `YC_ACCESS_KEY_ID`       | Статический ключ SA для S3 | Уже есть                                   |
| `YC_SECRET_ACCESS_KEY`   | Пара к `ACCESS_KEY_ID`     | Уже есть                                   |

Обязательная GitHub Variable:

| Variable                     | Что содержит                               |
| ---------------------------- | ------------------------------------------ |
| `YC_LEAD_SERVICE_ACCOUNT_ID` | ID отдельного runtime SA функции и таймера |

Опциональные GitHub Variables:

| Variable                         | Default                  | Что меняет                                                                 |
| -------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `YDB_DATABASE_NAME`              | `zvenfit-leads`          | Имя Serverless БД                                                          |
| `YDB_LEADS_TABLE`                | `leads`                  | Таблица заявок                                                             |
| `YDB_RATE_LIMITS_TABLE`          | `lead_rate_limits`       | Технические счётчики ограничения частоты                                   |
| `LEAD_RATE_LIMIT_MAX`            | `5`                      | Допустимых заявок с одного IP за окно                                      |
| `LEAD_RATE_LIMIT_WINDOW_SECONDS` | `600`                    | Размер окна ограничения частоты                                            |
| `MAX_TELEGRAM_ATTEMPTS`          | `12`                     | После скольких попыток поставить статус `failed`                           |
| `YDB_QUERY_TIMEOUT_MS`           | `5000`                   | Клиентский таймаут операции/транзакции YDB                                 |
| `YDB_SLOW_OPERATION_MS`          | `1000`                   | Порог SQL-операции `ydb_slow_operation`, без холодного запуска YDB-клиента |
| `YDB_SESSION_POOL_SIZE`          | `5`                      | Максимум YDB-сессий на экземпляр функции                                   |
| `MONIUM_METRICS_ENABLED`         | `true`                   | Включает прямую отправку метрик функции по OTLP                            |
| `MONIUM_PROJECT`                 | `folder__<YC_FOLDER_ID>` | Проект Monium; локальный deploy выводит его из folder ID                   |
| `MONIUM_CLUSTER`                 | `default`                | Кластер прямых метрик                                                      |
| `MONIUM_SERVICE`                 | `zvenfit-frontend`       | Сервис прямых метрик                                                       |
| `MONIUM_METRICS_TIMEOUT_MS`      | `1000`                   | Максимальное ожидание отправки метрик в конце вызова                       |
| `NODE_ENV`                       | `production`             | Значение поля `environment` в structured logs функций                      |

Имена bucket, functions, retry trigger, YDB и список CORS origins не хранятся в
GitHub Variables. Они явно зафиксированы в environment wrappers:

- `.github/workflows/main.yml` — production;
- `.github/workflows/staging.yml` — staging;
- `.github/workflows/_deploy-environment.yml` — общая реализация.

До обращения к Yandex Cloud workflow запускает
`scripts/validate-deployment-config.cjs`. Он требует точную карту ресурсов и не
позволяет staging использовать production names или origins.

До первого CI deploy создай YDB, обе функции и отдельный runtime SA под учётной
записью администратора. Права CI и runtime выдаются на конкретные ресурсы:

```bash
export CI_SA_ID=$(yc iam service-account get --name zvenfit-ci-sa --format json | jq -r '.id')

yc ydb database create \
  --name zvenfit-leads \
  --description="Durable ZvenFit website leads" \
  --serverless \
  --sls-storage-size=1GB \
  --deletion-protection

yc iam service-account create \
  --name zvenfit-lead-runtime \
  --description="Runtime identity for ZvenFit durable lead delivery"
export RUNTIME_SA_ID=$(yc iam service-account get --name zvenfit-lead-runtime --format json | jq -r '.id')

yc ydb database add-access-binding \
  --name zvenfit-leads \
  --role ydb.editor \
  --service-account-id $CI_SA_ID

yc ydb database add-access-binding \
  --name zvenfit-leads \
  --role ydb.editor \
  --service-account-id $RUNTIME_SA_ID

yc iam service-account add-access-binding \
  --id $RUNTIME_SA_ID \
  --role iam.serviceAccounts.user \
  --service-account-id $CI_SA_ID

yc resource-manager folder add-access-binding \
  --id $YC_FOLDER_ID \
  --role monium.metrics.writer \
  --service-account-id $RUNTIME_SA_ID

yc serverless function create --name zvenfit-telegram-lead
yc serverless function allow-unauthenticated-invoke zvenfit-telegram-lead
yc serverless function add-access-binding \
  --name zvenfit-telegram-lead \
  --role functions.functionInvoker \
  --service-account-id $RUNTIME_SA_ID

yc serverless function create --name zvenfit-fitbase-schedule
yc serverless function allow-unauthenticated-invoke zvenfit-fitbase-schedule
```

Публичный `functionInvoker` назначается один раз администратором. Обычный deploy
только проверяет этот binding и поэтому CI не нуждается в `functions.admin`.

Создай для этого SA API key со scope `yc.monium.metrics.write` и сохрани его
secret-часть в GitHub Secret `MONIUM_API_KEY`. OTLP не принимает IAM-токен из
контекста Cloud Function: заголовок должен иметь вид `Authorization: Api-Key …`.
Его ID положи в `YC_LEAD_SERVICE_ACCOUNT_ID`.
Workflow остановит deploy, если переменная отсутствует; CI SA как runtime-аккаунт не используется.

### 5. Первый деплой

```bash
git add .
git commit -m "Setup Telegram lead bot"
git push origin main
```

**Что произойдёт:**

1. Workflow проверяет заранее созданную Serverless БД `zvenfit-leads` с защитой от удаления.
2. Создаёт временные таблицы и прогоняет YDB integration test; production-таблица не меняется.
3. До переключения функции применяет версионированные восстанавливаемые YDB-миграции из
   `functions/lead-intake/src/ydb/migrations.ts`.
4. Деплоит Cloud Function без DDL в пользовательском запросе.
5. Создаёт минутный timer trigger для повторной доставки в Telegram.
6. Получает URL функции, собирает сайт и заливает его в Object Storage.

Очередь повторной отправки использует синхронный индекс `idx_telegram_due` по
`telegram_due_at`; минутный timer не сканирует всю таблицу. Production workflow
не отменяет уже начатый deploy, чтобы не прерывать DDL-миграцию посередине.

**Готово.** Форма на сайте работает.

Staging не создаётся этим production runbook. Его изоляция, обязательные
ресурсы и порядок bootstrap описаны в [`staging-environment.md`](staging-environment.md).

---

## Локальная разработка

### Функция (локальный деплой)

```bash
export YC_FOLDER_ID=b1g...
export YC_LEAD_SERVICE_ACCOUNT_ID=aje...
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...
export LEAD_RATE_LIMIT_SECRET="$(openssl rand -hex 32)"

npm run deploy:lead-fn
```

Скопируй `LEAD_API_URL` из вывода.

### Сайт (dev-сервер)

```bash
export LEAD_API_URL=https://functions.yandexcloud.net/...
npm run build
npm run dev  # localhost:4173
```

Открой `/forma-dlya-zayavki/` → тестируй.

---

## Изменение доменов (CORS)

Если добавляешь новый домен:

```yaml
# .github/workflows/main.yml
env:
  ALLOWED_ORIGINS: 'https://zvenfit.ru,https://www.zvenfit.ru,https://new.domain'
```

Коммит → push → функция обновится с новым CORS.

---

## Troubleshooting

### Форма показывает ошибку

Сначала запусти read-only production smoke-test. Он не создаёт заявку:

```bash
npm run smoke:production
```

Скрипт проверит production-страницу, инжектированный URL функции и CORS preflight. Если нужен полный end-to-end тест, следующий запрос создаст реальную запись в YDB и уведомление в Telegram:

```bash
# 1. Проверь URL в билде
curl https://zvenfit.ru/js/lead-config.js
# Должно быть: window.ZVENFIT_LEAD_API = 'https://functions...'

# 2. Тест функции
URL=$(yc serverless function get --name zvenfit-telegram-lead --format json | jq -r .http_invoke_url)
curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+7 999","service":"Позвонить"}'
# Ответ: {"ok":true,"lead_id":"...","notification":"pending"}
```

`202` и `ok: true` означают, что заявка надёжно сохранена в YDB. Telegram отправляется
асинхронно минутным таймером; `notification: pending` означает, что она ожидает фоновой доставки.

### Интеграционная проверка YDB

Тест создаёт три случайно именованные временные таблицы, проверяет миграции,
конкурентную идемпотентность, rate limit, индексированную очередь, lease и delivery token,
затем удаляет только эти тестовые таблицы:

```bash
YDB_TEST_CONNECTION_STRING="$YDB_CONNECTION_STRING" \
YDB_ACCESS_TOKEN_CREDENTIALS="$(yc iam create-token)" \
npm run test:lead-ydb
```

### Посмотреть сохранённые заявки

Открой YDB → `zvenfit-leads` → Query и выполни:

```sql
SELECT
  lead_id,
  created_at,
  name,
  phone,
  contact_method,
  telegram_status,
  telegram_attempts,
  telegram_last_error
FROM leads
ORDER BY created_at DESC
LIMIT 100;
```

Статусы уведомления: `pending`, `sending`, `sent`, `failed`. Доступ к таблице содержит
персональные данные и должен быть только у тех, кто обрабатывает заявки. Заявки сохраняются
без автоматического удаления. При отзыве согласия запись нужно удалить вручную.

### Импорт старых заявок из Telegram

Экспортируй чат через Telegram Desktop в HTML и сначала запусти проверку. Dry-run выводит только
агрегаты и коды ошибок, без имён и телефонов:

```bash
npm run import:leads -- --file "/absolute/path/to/messages.html"
```

Если `rejected` равен нулю, импортируй записи в YDB:

```bash
ZVENFIT_YDB_ENDPOINT=$(yc ydb database get --name=zvenfit-leads --format=json \
  | node -e 'const fs=require("node:fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(d.endpoint||"")')

YDB_CONNECTION_STRING="$ZVENFIT_YDB_ENDPOINT" \
YDB_ACCESS_TOKEN_CREDENTIALS=$(yc iam create-token) \
npm run import:leads -- --file "/absolute/path/to/messages.html" --apply
```

Импорт идемпотентен: `lead_id` детерминирован из ID Telegram-сообщения. Исторические записи сразу
получают статус `sent` и не попадают в очередь повторной отправки. Не меняй `--source-key` между
повторными запусками одного экспорта. Сам экспорт содержит персональные данные — не коммить его и
не включай подробный shell tracing (`set -x`) при запуске команды с IAM-токеном.

### Сообщения не приходят

```bash
# 1. Бот работает?
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"

# 2. Chat ID правильный?
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID&text=test"
```

### GitHub Actions fail

**deploy-function:**

- `Authentication failed` → проверь `YC_SA_JSON_KEY` (валидный JSON?)
- `YDB database ... must be provisioned` → создай БД один раз и выдай CI `ydb.editor` на эту БД
- ошибка YDB integration test или migration → проверь `ydb.editor` у CI на базе `zvenfit-leads`
- ошибка создания timer trigger → `functions.editor` у CI и `functions.functionInvoker` у runtime SA
- `missing the one-time public functionInvoker binding` → один раз выполни указанную команду под администратором
- функция отвечает `storage_unavailable` → runtime SA не имеет `ydb.editor` или неверен endpoint БД
- `Failed to get function URL` → функция создалась? Проверь в консоли YC

**deploy-site:**

- `Upload files failed` → проверь `YC_ACCESS_KEY_ID` / `YC_SECRET_ACCESS_KEY`
- CORS error → `ALLOWED_ORIGINS` в workflow env

---

## Кеширование сайта

Cloud CDN использует заголовки источника с fallback `86400` секунд, не подменяет browser TTL и учитывает query-параметр `v` в ключе кеша. Workflow загружает HTML, `robots.txt` и `sitemap.xml` с `Cache-Control: no-cache, must-revalidate`, а версионированные CSS/JS — с `Cache-Control: public, max-age=31536000, immutable`.

Перед сборкой передавайте уникальный `ASSET_VERSION` через окружение или GitHub Variables. После изменения CSS/JS не используйте прежнее значение:

```bash
ASSET_VERSION=2026-08-08-1 npm run build
```

После первого деплоя с новыми метаданными очистите кеш CDN и проверьте заголовки HTML, реального 404 и CSS/JS.

---

## Ротация секретов

### Токен бота

```bash
# @BotFather → /revoke → новый токен
# Обнови GitHub Secret TELEGRAM_BOT_TOKEN
# Перезапусти workflow вручную (Actions → Deploy to Production → Run workflow)
```

### SA ключ

```bash
yc iam key create --service-account-name github-ci-zvenfit --output sa-key-new.json
# Обнови YC_SA_JSON_KEY в GitHub Secrets
cat sa-key-new.json

# После проверки удали старый
yc iam key list --service-account-name github-ci-zvenfit
yc iam key delete <KEY_ID>
rm sa-key-new.json
```
