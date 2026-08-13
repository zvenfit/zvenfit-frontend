# Monitoring and alerts

Минимальный мониторинг production-функций без персональных данных в логах.
Машиночитаемый источник конфигурации: `scripts/monitoring.config.json`.

> [!IMPORTANT]
> Обычные log metrics, notification channels и alerts Yandex Monitoring пока не представлены
> как ресурсы публичного `yc` CLI или Terraform provider. Поэтому их создание — одноразовый шаг
> в management console. `scripts/monitoring.config.json` фиксирует точный desired state, а
> `scripts/test-monitoring-alerts.sh` проверяет application log metrics синтетическими событиями.
> Метрики platform runtime проверяются только по реальным техническим логам: намеренно ронять
> production-функции для теста нельзя.

## Текущая инфраструктура

| Ресурс                    | Значение                          |
| ------------------------- | --------------------------------- |
| Monium project            | `folder__b1ge1e4iopttj79hfdfm`    |
| Cloud Logging group       | `default`                         |
| Log cluster / service     | `default` / `default`             |
| Application / environment | `zvenfit-frontend` / `production` |
| Lead function             | `zvenfit-telegram-lead`           |
| Schedule function         | `zvenfit-fitbase-schedule`        |
| Cloud Logging retention   | 3 days                            |

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

| Event                                  | Meaning                                                      | Severity   |
| -------------------------------------- | ------------------------------------------------------------ | ---------- |
| `lead_storage_error`                   | Новую заявку не удалось сохранить в YDB                      | Critical   |
| `lead_submission_blocked`              | Honeypot, размер или rate limit отклонил отправку            | Diagnostic |
| `lead_rate_limit_error`                | Rate limiter недоступен; заявка пропущена fail-open          | Warning    |
| `lead_persisted`                       | Новая валидная заявка сохранена                              | Diagnostic |
| `telegram_delivery_retry_error`        | Retry-задача не смогла обработать заявку                     | Critical   |
| `telegram_delivery_retry_scheduled`    | Telegram временно недоступен, будет retry                    | Log only   |
| `telegram_delivery_failed_permanently` | Исчерпаны попытки Telegram                                   | Critical   |
| `ydb_operation_completed`              | Длительность SQL-операции и число retry, без запуска клиента | Diagnostic |
| `ydb_retry`                            | YDB SDK повторил операцию после временной ошибки             | Warning    |
| `ydb_slow_operation`                   | Операция YDB превысила `YDB_SLOW_OPERATION_MS`               | Warning    |
| `ydb_operation_failed`                 | Операция YDB завершилась ошибкой                             | Critical   |
| `fitbase_schedule_error`               | Fitbase вернул ошибку или недоступен                         | Warning    |
| `schedule_provider_misconfigured`      | Provider не настроен или fixture запрещён в production       | Critical   |

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
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"fitbase_schedule_error|schedule_provider_misconfigured"}
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

### 8. Schedule runtime errors without client cancellations

- ID: `zvenfit_schedule_runtime_errors_1m`
- Window: 1 minute
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", resource_type="serverless.function", resource_id="d4e80noc1hjn2g8u0beq", level="ERROR", message!=*"Code: 499"}
```

Селектор считает системные `ERROR` функции расписания и исключает
`499 Request cancelled`. Cloud Functions пишет `499`, когда вызывающий клиент
закрыл соединение; для read-only `GET` расписания это не исключение handler и
не может привести к потере заявки.

### 9. Client cancellations

- ID: `zvenfit_schedule_client_cancellations_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", resource_type="serverless.function", resource_id="d4e80noc1hjn2g8u0beq", level="ERROR", message=*"Code: 499"}
```

Эта диагностическая метрика сохраняет видимость отмен запросов расписания
отдельно от настоящих runtime errors. Одиночная отмена даёт `Warning`; `Alarm`
требует не меньше десяти отмен за десять минут. У lead-функции `499` не
исключается: отменённый POST остаётся критическим runtime signal, пока нельзя
доказать, что заявка была сохранена до разрыва соединения.

Каждая операция также пишет `ydb_operation_completed` с полями `operation`,
`duration_ms` и `retry_attempts`. Значения заявки и текст SQL в эти события не попадают.

Исходные логи читаются из `service="default"`, а все девять созданных агрегатов
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

Создай пятнадцать обычных алертов. Девять сигналов lead pipeline используют
прямые OTLP-метрики приложения, Fitbase и отфильтрованные runtime errors —
агрегаты логов, retry trigger — автоматические метрики Cloud Functions, storage
alert — две автоматические метрики YDB. Клиентские `499` вынесены в отдельный
диагностический сигнал:

| Alert ID                              | Metric / signal                              | Function | Warning |    Alarm | Window | Delay | No data |
| ------------------------------------- | -------------------------------------------- | -------- | ------: | -------: | -----: | ----: | ------- |
| `zvenfit_lead_storage_errors`         | direct `zvenfit_lead_storage_errors`         | `max`    |   `> 0` |  `> 0.5` |     5m |   30s | OK      |
| `zvenfit_permanent_telegram_failures` | direct `zvenfit_telegram_delivery_failed_1m` | `max`    |   `> 0` |  `> 0.5` |     5m |   30s | OK      |
| `zvenfit_fitbase_errors`              | log aggregate `zvenfit_fitbase_errors_5m`    | `max`    |   `> 0` |  `> 0.5` |    10m |    3m | OK      |
| `zvenfit_function_runtime_errors`     | automatic lead `functions_errors`            | `sum`    |   `> 0` |  `> 0.5` |     5m |   30s | OK      |
| `zvenfit_schedule_runtime_errors`     | schedule logs excluding `Code: 499`          | `max`    |   `> 0` |  `> 0.5` |     5m |    3m | OK      |
| `zvenfit_schedule_cancellations`      | schedule logs for `Code: 499`                | `sum`    |   `> 0` |  `> 9.5` |    10m |    3m | OK      |
| `zvenfit_ydb_retries`                 | direct `zvenfit_ydb_retries_5m`              | `sum`    | `> 4.5` |  `> 5.5` |    10m |   30s | OK      |
| `zvenfit_slow_ydb_operations`         | direct `zvenfit_ydb_slow_operations_5m`      | `sum`    | `> 0.5` |  `> 2.5` |    10m |   30s | OK      |
| `zvenfit_rate-limited_leads`          | direct `zvenfit_lead_rate_limited_5m`        | `sum`    |   `> 0` |    `> 5` |    10m |   30s | OK      |
| `zvenfit_persisted_leads_volume`      | direct `zvenfit_leads_persisted_5m`          | `sum`    |  `> 10` |   `> 20` |    10m |   30s | OK      |
| `zvenfit_retry_worker_heartbeat`      | direct `zvenfit_retry_worker_heartbeat`      | `last`   | `< 0.9` |  `< 0.5` |     5m |   30s | Alarm   |
| `zvenfit_telegram_delivery_backlog`   | direct oldest pending age, seconds           | `last`   | `> 600` | `> 1800` |     5m |   30s | OK      |
| `zvenfit_rate_limit_health_errors`    | direct `zvenfit_rate_limit_errors_5m`        | `sum`    |   `> 0` |    `> 2` |    10m |   30s | OK      |
| `zvenfit_retry_trigger_errors`        | trigger access and invocation errors         | `max`    |   `> 0` |  `> 0.5` |     5m |   30s | OK      |
| `zvenfit_ydb_storage_usage`           | query `C`, storage used percent              | `last`   | `>= 70` |  `>= 85` |    15m |   30s | Warning |

Monium требует `Alarm > Warning`. Для целочисленных счётчиков промежуточное
значение `0.5` техническое. Для error counters первая точка со значением `1`
сразу даёт `Alarm`; для slow YDB пороги намеренно разведены: единичное превышение
даёт `Warning`, а `Alarm` требует минимум три превышения за 10 минут. Для
клиентских отмен первая точка даёт только `Warning`, а `Alarm` требует десять
отмен за 10 минут. Heartbeat в норме всегда равен `1`; его основная проверка —
политика `No data = Alarm`. Прямые и platform metrics используют задержку
вычисления `30s`, а все log aggregates — `3m`, чтобы дождаться поставки логов.

Приложение экспортирует event counters с `DELTA` temporality. Каждая инвокация
serverless-функции создаёт отдельный одноразовый MeterProvider, поэтому
`CUMULATIVE` сбрасывал бы одну и ту же временную серию обратно в `1`. Latency
операции измеряется после готовности YDB-клиента, чтобы холодное создание driver
не выглядело как медленный SQL-запрос. Порог `YDB_SLOW_OPERATION_MS` относится
именно к выполнению операции после инициализации клиента.

Селектор прямой метрики ошибки сохранения:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="zvenfit-frontend", name="zvenfit_lead_storage_errors"}
```

Lead-функция отправляет девять alert-метрик и одну dashboard-метрику напрямую в Monium по OTLP с
`service="zvenfit-frontend"`, поэтому эти alerts не зависят от Preview-конвейера
метрик по логам. Новые health-сигналы:

- `zvenfit_retry_worker_heartbeat` — успешное завершение минутного retry pass;
- `zvenfit_telegram_pending_leads` — текущий размер очереди для dashboard;
- `zvenfit_telegram_oldest_pending_age_seconds` — возраст старейшей ожидающей заявки;
- `zvenfit_rate_limit_errors_5m` — недоступность fail-open rate limiter.

Heartbeat записывается только после retry pass и read-only проверки очереди.
Если timer не вызвал функцию, YDB недоступна или OTLP export перестал работать,
точки исчезнут и heartbeat alert перейдёт в `Alarm`. Для записи используется
GitHub Secret `MONIUM_API_KEY`: API key runtime SA с ролью
`monium.metrics.writer` и scope `yc.monium.metrics.write`.

Fitbase не использует `functions_errors` как основной application alert: handler
перехватывает недоступность upstream и возвращает контролируемый HTTP `502`, то
есть invocation может считаться успешно завершённым. Поэтому
`zvenfit_fitbase_errors` проверяет созданный log aggregate:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="logging_aggregates", name="zvenfit_fitbase_errors_5m"}
```

Существующий критический `zvenfit_function_runtime_errors` остаётся на
автоматической платформенной метрике, но теперь следит только за lead-функцией:

```text
{project="folder__b1ge1e4iopttj79hfdfm", service="serverless-functions", name="functions_errors", resource_id="zvenfit-telegram-lead"}
```

Здесь намеренно не исключается `499`: для POST заявки разрыв клиента может
произойти до записи в YDB, поэтому любое такое выполнение требует внимания.
Проблемы после сохранения дополнительно и независимо ловят storage error,
permanent Telegram failure, retry heartbeat и backlog alerts.

Критический runtime alert расписания использует отфильтрованный агрегат:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="logging_aggregates", name="zvenfit_schedule_runtime_errors_1m"}
```

Диагностический alert отмен расписания использует отдельный агрегат:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="logging_aggregates", name="zvenfit_schedule_client_cancellations_5m"}
```

Автоматическая `functions_errors` расписания остаётся на service dashboard для
общего анализа, но не управляет критическим schedule alert: она включает
`499 Request cancelled` и не позволяет отфильтровать код ошибки по labels метрики.

Селектор ошибок минутного retry trigger:

```text
{project="folder__b1ge1e4iopttj79hfdfm", service="serverless-functions", name="serverless.triggers.access_error_per_second|serverless.triggers.error_per_second", trigger="a1smkp9ng1f4g9vqgm7u", type="request"}
```

Он отдельно ловит потерю `functionInvoker`, ошибки вызова функции и другие
проблемы trigger до того, как истечёт пятиминутное окно heartbeat.

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

Для direct, runtime и diagnostic алертов отсутствие точек обычно считается `OK`.
Исключение — heartbeat: отсутствие точек считается `Alarm`. Для storage отсутствие
любой из двух platform metrics считается `Warning`: потеря данных о заполнении базы
не должна выглядеть как исправное состояние. Во все пятнадцать алертов добавь оба
канала: **ZvenFit Telegram alerts** и **ZvenFit Email alerts**.

## Проверка доставки алертов

Скрипт ниже пишет синтетические записи без персональных данных и проверяет raw
logs и диагностические log metrics. Событие `fitbase_schedule_error` намеренно
переведёт production Fitbase alert в `Alarm`, поэтому запускай скрипт только при
явной проверке каналов доставки:

```bash
bash scripts/test-monitoring-alerts.sh --confirm
```

Доставку каналов проверяй по истории алертов: и Telegram, и email должны иметь
`Success` для переходов `Alarm`, `Warning` и `OK`. Синтетический smoke не покрывает
`zvenfit_schedule_runtime_errors_1m` и `zvenfit_schedule_client_cancellations_5m`: их
селекторы проверяются по сохранённым platform logs. Намеренно ронять production-
функции, обрывать клиентские запросы или заполнять production-базу нельзя.

## Dashboard

Для вызовов, runtime errors и latency используй готовые service dashboards
Cloud Functions. В отдельный компактный dashboard добавь ключевые error counters,
heartbeat, размер и возраст Telegram-очереди, а также виджеты статуса пятнадцати
алертов. Для YDB отдельно выведи количество `ydb_retry`, `ydb_slow_operation`
и p95 поля `duration_ms` из `ydb_operation_completed`, а также `C` — процент
использованного хранилища.

## Cost estimate

- Automatic Yandex Cloud metrics and service dashboards: free.
- Nine log-derived metrics at one point per window: less than `0.25 RUB/month`.
- Fifteen continuously evaluated alerts: about `16.20 RUB/month` at the current
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

The tests verify exact event IDs, the `Code: 499` split between the two platform
log selectors, and that the Fitbase response body is not written to logs.
