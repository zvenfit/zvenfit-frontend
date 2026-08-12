# Production launch checklist

Единый чеклист запуска надёжного хранения заявок в YDB, уведомлений в Telegram,
расписания Fitbase и мониторинга. Выполняй пункты сверху вниз.

## Уже готово в коде

- [x] Изменения собраны в ветке `feature/durable-leads-ydb`.
- [x] Заявка сначала сохраняется в YDB, а затем отправляется в Telegram.
- [x] Retry timer повторяет доставку Telegram и не теряет сохранённый лид.
- [x] YDB-миграции восстанавливаются после прерванного deploy.
- [x] Некорректные элементы `trainers` от Fitbase отбрасываются без падения всего расписания.
- [x] Unit/integration-тесты запускаются по TypeScript-исходникам из `src`.
- [x] Создан отдельный runtime service account `zvenfit-lead-runtime` с ID
      `ajeev1i4lcsf73pvi96p` с точечными ролями YDB/Cloud Functions и
      `monium.metrics.writer` для прямых OTLP-метрик.
- [x] Логи не содержат имён, телефонов, Telegram username, UTM и секретов.

## 1. Подготовить GitHub

Открой репозиторий GitHub → **Settings → Secrets and variables → Actions**.

- [ ] Создай repository variable:
      `YC_LEAD_SERVICE_ACCOUNT_ID=ajeev1i4lcsf73pvi96p`.
- [ ] В `@BotFather` отзови старый токен бота и получи новый.
- [ ] Обнови GitHub Secret `TELEGRAM_BOT_TOKEN` новым значением.
- [ ] Создай GitHub Secret `LEAD_RATE_LIMIT_SECRET`: `openssl rand -hex 32`.
- [ ] Не присылай токен в чат и не записывай его в файлы проекта.
- [ ] Убедись, что уже настроены Secrets:
      `YC_SA_JSON_KEY`, `YC_FOLDER_ID`, `TELEGRAM_CHAT_ID`,
      `YC_ACCESS_KEY_ID`, `YC_SECRET_ACCESS_KEY`, `FITBASE_API_TOKEN`.

## 2. Проверить ветку и запустить deploy

Перед отправкой ветки можно повторить локальные проверки:

```bash
npm run test:lead-fn
npm run test:schedule-fn
npm run test:monitoring
npm run lint:public
npm run test:build
```

- [ ] Запуши `feature/durable-leads-ydb` в GitHub.
- [ ] Создай PR в `main`, дождись зелёных проверок и влей его.
- [ ] Открой **Actions → Deploy to Production** и дождись успешного workflow.
- [ ] Проверь, что прошли шаги YDB integration test, migrations, deploy обеих
      функций, создание retry timer, сборка сайта и загрузка в Object Storage.

Workflow сам создаст/обновит таблицы YDB, функции и минутный retry timer.
Не прерывай workflow во время шага миграций.

## 3. Smoke-проверка production

- [ ] Открой <https://zvenfit.ru/forma-dlya-zayavki/> и отправь одну явно тестовую заявку.
- [ ] Убедись, что форма показала успешную отправку.
- [ ] Убедись, что сообщение пришло в рабочий Telegram-чат.
- [ ] В Yandex Cloud открой YDB → `zvenfit-leads` → Query и проверь запись:

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
LIMIT 20;
```

- [ ] У тестовой заявки должен быть статус `sent`. Статус `pending` допустим
      только временно: retry timer должен позднее перевести его в `sent`.
- [ ] Открой <https://zvenfit.ru/raspisanie/> и проверь, что расписание загружается.

## 4. Импортировать старые заявки из Telegram

Архив находится в:
`/Users/nelmad/Downloads/Telegram Lite/ChatExport_2026-08-08`.
Найди внутри HTML-файл с сообщениями, обычно `messages.html`.

Сначала обязательный dry-run — он ничего не записывает в YDB:

```bash
npm run import:leads -- \
  --file "/Users/nelmad/Downloads/Telegram Lite/ChatExport_2026-08-08/messages.html"
```

- [ ] Проверь итог dry-run: `rejected` должен быть равен `0`, а число
      распознанных заявок — выглядеть правдоподобно.
- [ ] Если результат корректный, выполни импорт по инструкции
      [setup.md](setup.md#импорт-старых-заявок-из-telegram) с флагом `--apply`.
- [ ] Повтори SQL-запрос из предыдущего раздела и выборочно проверь старые заявки.

Импорт идемпотентен: повторный запуск одного экспорта не создаёт дубликаты.
Архив содержит персональные данные — не добавляй его в Git.

## 5. Настроить алерты

Это одноразовое действие в интерфейсе Yandex Monitoring. Точные селекторы и
пороги находятся в [monitoring.md](monitoring.md).

- [ ] Создай семь log-based metrics.
- [ ] Создай канал `ZvenFit Telegram alerts` через `@YandexCloudNotify_bot`
      в отдельную админскую группу.
- [ ] Создай резервный канал `ZvenFit Email alerts`.
- [ ] Включи уведомления для `Alarm`, `Warning`, `OK` и повтор каждые 30 минут.
- [ ] Создай тринадцать алертов и подключи к каждому оба канала.
- [ ] Для `zvenfit_retry_worker_heartbeat` проверь политику `No data → Alarm`.
- [ ] Для `zvenfit_telegram_delivery_backlog` проверь Warning 10 минут и Alarm 30 минут.
- [ ] Для `zvenfit_ydb_storage_usage` проверь запросы `A/B/C`, пороги Warning 70%,
      Alarm 85% и политику `No data → Warning`.
- [ ] Запусти синтетическую проверку:

```bash
bash scripts/test-monitoring-alerts.sh --confirm
```

- [ ] Убедись, что сообщения пришли в Telegram и email, а алерты затем
      вернулись в `OK`.
- [ ] Для runtime alert сверь селектор обеих функций и `No data → OK`;
      production-функции специально ронять не нужно.

## 6. После успешного запуска

- [ ] В течение первых суток проверь логи функций и статусы заявок в YDB.
- [ ] Убедись, что нет заявок, надолго оставшихся в `pending` или `failed`.
- [ ] После изменений CSS/JS проверь актуальный `ASSET_VERSION` и очистку CDN-кеша.
- [ ] Удали тестовую заявку из рабочих процессов вручную, если она попала менеджерам.

## Эскалация защиты от спама

Honeypot и серверный rate limit уже включены в код. Если метрика
`zvenfit_lead_rate_limited_5m` регулярно уходит в Alarm или спам проходит
в пределах распределённых IP, отдельным решением подключить Yandex SmartCaptcha.

## Запуск считается завершённым, когда

- новая заявка одновременно видна в YDB и Telegram;
- при временном сбое Telegram заявка остаётся в YDB и доставляется retry timer;
- расписание открывается даже при некорректных отдельных данных тренера;
- старые заявки импортированы без `rejected` и дубликатов;
- тестовые уведомления всех production-алертов получены в Telegram и email.
