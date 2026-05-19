# Setup: Telegram Bot + Yandex Cloud

Автоматический деплой Cloud Function для приёма заявок с сайта.

## Архитектура

```
Форма на сайте → Cloud Function (токен в env) → Telegram группа
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
export SA_NAME=github-ci-zvenfit

# Создать SA
yc iam service-account create --name $SA_NAME

# Дать роли
SA_ID=$(yc iam service-account get --name $SA_NAME --format json | jq -r '.id')

yc resource-manager folder add-access-binding \
  --id $YC_FOLDER_ID \
  --role serverless.functions.admin \
  --service-account-id $SA_ID

yc resource-manager folder add-access-binding \
  --id $YC_FOLDER_ID \
  --role iam.serviceAccounts.user \
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

| Secret | Откуда | Пример |
|--------|--------|--------|
| `YC_SA_JSON_KEY` | `sa-key.json` целиком | `{"id":"aje...","service_account_id":...}` |
| `YC_FOLDER_ID` | `yc config get folder-id` | `b1g...` |
| `TELEGRAM_BOT_TOKEN` | @BotFather | `123456:ABC...` |
| `TELEGRAM_CHAT_ID` | getUpdates | `-5161525132` |
| `YC_ACCESS_KEY_ID` | Статический ключ SA для S3 | Уже есть |
| `YC_SECRET_ACCESS_KEY` | Пара к `ACCESS_KEY_ID` | Уже есть |

### 5. Первый деплой

```bash
git add .
git commit -m "Setup Telegram lead bot"
git push origin main
```

**Что произойдёт:**
1. Workflow `main.yml` деплоит Cloud Function
2. Получает URL функции
3. Собирает сайт с этим URL
4. Заливает в Object Storage

**Готово.** Форма на сайте работает.

---

## Локальная разработка

### Функция (локальный деплой)

```bash
export YC_FOLDER_ID=b1g...
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...

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

```bash
# 1. Проверь URL в билде
curl https://zvenfit.ru/js/lead-config.js
# Должно быть: window.ZVENFIT_LEAD_API = 'https://functions...'

# 2. Тест функции
URL=$(yc serverless function get --name zvenfit-telegram-lead --format json | jq -r .http_invoke_url)
curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+7 999","service":"Позвонить"}'
# Ответ: {"ok":true}
```

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
- `Permission denied` → роль `serverless.functions.admin` на SA
- `Failed to get function URL` → функция создалась? Проверь в консоли YC

**deploy-site:**
- `Upload files failed` → проверь `YC_ACCESS_KEY_ID` / `YC_SECRET_ACCESS_KEY`
- CORS error → `ALLOWED_ORIGINS` в workflow env

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
