# Monitoring and alerts

Минимальный мониторинг production-функций без персональных данных в логах.
Машиночитаемый источник конфигурации: `scripts/monitoring.config.json`.

> [!IMPORTANT]
> Обычные log metrics, notification channels и alerts Yandex Monitoring пока не представлены
> как ресурсы публичного `yc` CLI или Terraform provider. Поэтому их создание — одноразовый шаг
> в management console. `scripts/monitoring.config.json` фиксирует точный desired state, а
> `scripts/test-monitoring-alerts.sh` проверяет готовую конфигурацию синтетическими событиями.

## Текущая инфраструктура

| Ресурс                  | Значение                       |
| ----------------------- | ------------------------------ |
| Monium project          | `folder__b1ge1e4iopttj79hfdfm` |
| Cloud Logging group     | `default`                      |
| Log cluster / service   | `default` / `default`          |
| Application / environment | `zvenfit-frontend` / `production` |
| Lead function           | `zvenfit-telegram-lead`        |
| Schedule function       | `zvenfit-fitbase-schedule`     |
| Cloud Logging retention | 3 days                         |

Project dashboard: <https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/dashboards/zvenfit-production-monitoring>

Cloud Logging автоматически показывает свои записи в Monium. Открыть логи:

<https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs>

Базовый селектор:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production"}
```

## События приложения

Функции пишут только технические идентификаторы и коды ошибок. Имя, телефон,
Telegram username, UTM и тело ответа Fitbase в лог не попадают.

Обе функции используют Pino с адаптером под structured logging Yandex Cloud:
уровни записываются как `ERROR/WARN/INFO`, каждый вызов получает `request_id`,
а известные поля с PII, телами запросов и секретами автоматически заменяются на
`[REDACTED]`. Уровень можно менять переменной `LOG_LEVEL`, по умолчанию `info`.

| Event                                  | Meaning                                             | Severity   |
| -------------------------------------- | --------------------------------------------------- | ---------- |
| `lead_storage_error`                   | Новую заявку не удалось сохранить в YDB             | Critical   |
| `lead_submission_blocked`              | Honeypot, размер или rate limit отклонил отправку     | Diagnostic |
| `lead_rate_limit_error`                | Rate limiter недоступен; заявка пропущена fail-open   | Warning    |
| `lead_persisted`                       | Новая валидная заявка сохранена                       | Diagnostic |
| `telegram_delivery_retry_error`        | Retry-задача не смогла обработать заявку            | Critical   |
| `telegram_delivery_retry_scheduled`    | Telegram временно недоступен, будет retry           | Log only   |
| `telegram_delivery_failed_permanently` | Исчерпаны попытки Telegram                          | Critical   |
| `ydb_operation_completed`              | Длительность и число retry завершённой операции YDB | Diagnostic |
| `ydb_retry`                            | YDB SDK повторил операцию после временной ошибки    | Warning    |
| `ydb_slow_operation`                   | Операция YDB превысила `YDB_SLOW_OPERATION_MS`      | Warning    |
| `ydb_operation_failed`                 | Операция YDB завершилась ошибкой                    | Critical   |
| `fitbase_schedule_error`               | Fitbase вернул ошибку или недоступен                | Warning    |
| `fitbase_schedule_misconfigured`       | В функции отсутствует Fitbase token                 | Critical   |

## Метрики по логам

В Monium открой **Поставка и хранение → Метрики по логам → Создать**. Для всех
метрик функция агрегации — `count`, группировка не нужна.

### 1. YDB/storage errors

- ID: `zvenfit_lead_storage_errors_1m`
- Window: 1 minute
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"lead_storage_error|telegram_delivery_retry_error"}
```

### 2. Permanent Telegram failures

- ID: `zvenfit_telegram_delivery_failed_1m`
- Window: 1 minute
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"telegram_delivery_failed_permanently"}
```

### 3. Fitbase errors

- ID: `zvenfit_fitbase_errors_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"fitbase_schedule_error|fitbase_schedule_misconfigured"}
```

### 4. YDB retries

- ID: `zvenfit_ydb_retries_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"ydb_retry"}
```

### 5. Slow YDB operations

- ID: `zvenfit_ydb_slow_operations_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"ydb_slow_operation"}
```

### 6. Rate-limited submissions

- ID: `zvenfit_lead_rate_limited_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"lead_submission_blocked", meta.reason="rate_limit"}
```

Поле `meta.reason` обязательно: honeypot и слишком большое тело запроса не должны
увеличивать именно эту метрику.

### 7. Persisted leads

- ID: `zvenfit_leads_persisted_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"lead_persisted"}
```

Каждая операция также пишет `ydb_operation_completed` с полями `operation`,
`duration_ms` и `retry_attempts`. Значения заявки и текст SQL в эти события не попадают.

Исходные логи читаются из `service="default"`, а все семь созданных агрегатов
записываются в отдельный `service="logging_aggregates"`. Текущий шард использует
метку `name` для ID, поэтому итоговый селектор имеет формат:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="logging_aggregates", name="<ID метрики>"}
```

Это проверено по карточкам созданных метрик. Перед созданием алерта всё равно
сверяй итоговый селектор конкретной метрики: он является источником истины.

## Alerts

Один раз создай два канала, потому что один канал Monium поддерживает только
один метод доставки:

- **ZvenFit Telegram alerts** (`zvenfit_telegram_alerts`) — primary: Telegram
  через `@YandexCloudNotify_bot` в отдельную админскую группу, со скриншотом;
- **ZvenFit Email alerts** (`zvenfit_email_alerts`) — backup: email;
- для обоих каналов включи статусы `Alarm`, `Warning`, `OK` и повтор каждые
  30 минут, пока алерт остаётся активным.

Отдельный бот Yandex Cloud важен: он сможет сообщить о проблеме, даже если бот
заявок потерял токен, доступ к чату или был заблокирован.

Создай девять обычных алертов. Шесть сигналов lead pipeline используют прямые
OTLP-метрики приложения, два runtime-сигнала — автоматическую метрику Cloud
Functions, storage alert — две автоматические метрики YDB:

| Alert ID                          | Metric / signal                          | Function | Warning | Alarm   | Window | Delay | No data |
| --------------------------------- | ---------------------------------------- | -------- | ------: | ------: | -----: | ----: | ------- |
| `zvenfit_lead_storage_errors`     | direct `zvenfit_lead_storage_errors`     | `max`    |   `> 0` |  `> 0.5` |     5m |   30s | OK      |
| `zvenfit_permanent_telegram_failures` | direct `zvenfit_telegram_delivery_failed_1m` | `max` |   `> 0` |  `> 0.5` |     5m |   30s | OK      |
| `zvenfit_fitbase_errors`          | `functions_errors`, schedule only        | `max`    |   `> 0` |  `> 0.5` |    10m |   30s | OK      |
| `zvenfit_function_runtime_errors` | `functions_errors` for both function names | `sum`  |   `> 0` |  `> 0.5` |     5m |   30s | OK      |
| `zvenfit_ydb_retries`             | direct `zvenfit_ydb_retries_5m`          | `sum`    | `> 4.5` |  `> 5.5` |    10m |   30s | OK      |
| `zvenfit_slow_ydb_operations`     | direct `zvenfit_ydb_slow_operations_5m`  | `sum`    |   `> 0` |  `> 0.5` |    10m |   30s | OK      |
| `zvenfit_rate-limited_leads`      | direct `zvenfit_lead_rate_limited_5m`    | `sum`    |   `> 0` |    `> 5` |    10m |   30s | OK      |
| `zvenfit_persisted_leads_volume`  | direct `zvenfit_leads_persisted_5m`      | `sum`    |  `> 10` |   `> 20` |    10m |   30s | OK      |
| `zvenfit_ydb_storage_usage`       | query `C`, storage used percent           | `last`   | `>= 70` | `>= 85` |    15m |   30s | Warning |

Monium требует `Alarm > Warning`. Для целочисленных счётчиков промежуточное
значение `0.5` техническое: любая первая точка со значением `1` сразу получает
статус `Alarm`. Прямые и platform metrics используют задержку вычисления `30s`.

Селектор прямой метрики ошибки сохранения:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="zvenfit-frontend", name="zvenfit_lead_storage_errors"}
```

Lead-функция отправляет шесть метрик напрямую в Monium по OTLP с
`service="zvenfit-frontend"`, поэтому эти alerts не зависят от Preview-конвейера
метрик по логам. Их имена перечислены в таблице выше.

Селектор автоматической метрики runtime errors:

```text
{project="folder__b1ge1e4iopttj79hfdfm", service="serverless-functions", name="functions_errors", resource_id="zvenfit-telegram-lead|zvenfit-fitbase-schedule"}
```

Несмотря на название метки, live Monitoring API возвращает в `resource_id`
имена функций, а не их облачные ID `d4e…`. Селектор проверен по фактическим
сериям `functions_errors` обеих production-функций.

Для `zvenfit_ydb_storage_usage` создай три запроса в текстовом режиме:

```text
A: {project="folder__b1ge1e4iopttj79hfdfm", service="ydb", name="resources.storage.used_bytes", database.serverless="zvenfit-leads"}
B: {project="folder__b1ge1e4iopttj79hfdfm", service="ydb", name="resources.storage.limit_bytes", database.serverless="zvenfit-leads"}
C: (A / B) * 100
```

Проверять нужно запрос `C`. Фактические labels `service` и `database.serverless`
проверены через Monitoring API для production-базы, а селекторы —
в редакторе алертов Monium. Метрика `used_bytes` включает
пользовательские данные, служебные данные и вторичные индексы, поэтому процент
отражает реальный расход лимита.

Для direct и runtime алертов отсутствие точек считается `OK`. Для storage
отсутствие любой из двух platform metrics считается `Warning`: потеря данных о
заполнении базы не должна выглядеть как исправное состояние. Во все девять
алертов добавь оба канала: **ZvenFit Telegram alerts** и **ZvenFit Email alerts**.

## Проверка доставки алертов

Скрипт ниже пишет синтетические записи без персональных данных и проверяет raw
logs и оставленные диагностические log metrics. Production alerts от них больше
не зависят:

```bash
bash scripts/test-monitoring-alerts.sh --confirm
```

Доставку каналов проверяй по истории реального runtime alert: и Telegram, и email
должны иметь `Success` для переходов `Alarm` и `OK`. Намеренно ронять production-
функции или заполнять production-базу для теста storage alert нельзя.

## Dashboard

Для вызовов, runtime errors и latency используй готовые service dashboards
Cloud Functions. В отдельный компактный dashboard добавь семь итоговых метрик
выше столбцами (`max`, без интерполяции пропусков) и виджеты статуса девяти
алертов. Для YDB отдельно выведи количество `ydb_retry`, `ydb_slow_operation`
и p95 поля `duration_ms` из `ydb_operation_completed`, а также `C` — процент
использованного хранилища.

## Cost estimate

- Automatic Yandex Cloud metrics and service dashboards: free.
- Seven log-derived metrics at one point per window: less than `0.15 RUB/month`.
- Nine continuously evaluated alerts: about `9.72 RUB/month` at the current
  tariff of `1.5 RUB / 1000 alert-hours`.
- Telegram and email notification channels: no separate charge; SMS and calls
  are not enabled.
- Cloud Logging remains within its free tier at the current traffic. The group
  currently retains three days of logs.

## Verification

Run the monitoring contract tests before deployment:

```bash
npm run test:lead-fn
npm run test:schedule-fn
npm run test:monitoring
```

The tests verify exact event IDs and that the Fitbase response body is not
written to logs.
