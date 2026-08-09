# Monitoring and alerts

Минимальный мониторинг production-функций без персональных данных в логах.
Машиночитаемый источник конфигурации: `scripts/monitoring.config.json`.

## Текущая инфраструктура

| Ресурс                  | Значение                       |
| ----------------------- | ------------------------------ |
| Monium project          | `folder__b1ge1e4iopttj79hfdfm` |
| Cloud Logging group     | `default`                      |
| Log cluster / service   | `default` / `default`          |
| Lead function           | `zvenfit-telegram-lead`        |
| Schedule function       | `zvenfit-fitbase-schedule`     |
| Cloud Logging retention | 3 days                         |

Cloud Logging автоматически показывает свои записи в Monium. Открыть логи:

<https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs>

Базовый селектор:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default"}
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
| `telegram_delivery_state_error`        | Сбой YDB при обработке статуса Telegram             | Critical   |
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
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", message=*"lead_storage_error|telegram_delivery_state_error|telegram_delivery_retry_error"}
```

### 2. Permanent Telegram failures

- ID: `zvenfit_telegram_delivery_failed_1m`
- Window: 1 minute
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", message=*"telegram_delivery_failed_permanently"}
```

### 3. Fitbase errors

- ID: `zvenfit_fitbase_errors_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", message=*"fitbase_schedule_error|fitbase_schedule_misconfigured"}
```

### 4. YDB retries

- ID: `zvenfit_ydb_retries_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", message=*"ydb_retry"}
```

### 5. Slow YDB operations

- ID: `zvenfit_ydb_slow_operations_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", message=*"ydb_slow_operation"}
```

Каждая операция также пишет `ydb_operation_completed` с полями `operation`,
`duration_ms` и `retry_attempts`. Значения заявки и текст SQL в эти события не попадают.

Monium создаст итоговые селекторы с `service="logging_aggregates"`. Перед
созданием алерта скопируй их из карточек метрик, чтобы не зависеть от значения
поля имени (`name`, `sensor` или `signal`) в текущей конфигурации шарда.

## Alerts

Один раз создай канал **ZvenFit production alerts**:

- primary: Telegram через `@YandexCloudNotify_bot` в отдельную админскую группу;
- backup: email;
- statuses: `Alarm`, `Warning`, `OK`;
- repeat: every 30 minutes while the alert remains active.

Отдельный бот Yandex Cloud важен: он сможет сообщить о проблеме, даже если бот
заявок потерял токен, доступ к чату или был заблокирован.

Создай шесть обычных алертов. Пять используют итоговые метрики по логам.
Runtime alert использует бесплатную автоматическую метрику Cloud Functions:

| Alert ID                          | Metric                                   | Function | Alarm | Evaluation window | No data |
| --------------------------------- | ---------------------------------------- | -------- | ----: | ----------------: | ------- |
| `zvenfit-lead-storage`            | `zvenfit_lead_storage_errors_1m`         | `max`    | `> 0` |         5 minutes | OK      |
| `zvenfit-telegram-delivery`       | `zvenfit_telegram_delivery_failed_1m`    | `max`    | `> 0` |         5 minutes | OK      |
| `zvenfit-fitbase-schedule`        | `zvenfit_fitbase_errors_5m`              | `max`    | `> 0` |        10 minutes | OK      |
| `zvenfit-function-runtime-errors` | `functions_errors` for both function IDs | `sum`    | `> 0` |         5 minutes | OK      |
| `zvenfit-ydb-retries`             | `zvenfit_ydb_retries_5m`                 | `sum`    | `> 5` |        10 minutes | OK      |
| `zvenfit-ydb-latency`             | `zvenfit_ydb_slow_operations_5m`         | `sum`    | `> 0` |        10 minutes | OK      |

Селектор автоматической метрики runtime errors:

```text
{project="folder__b1ge1e4iopttj79hfdfm", service="serverless-functions", name="functions_errors", resource_id="d4ea7c6tcac97hu62rab|d4e80noc1hjn2g8u0beq"}
```

Отсутствие точек считается `OK`: эти метрики появляются только при ошибках.
Во все шесть алертов добавь канал **ZvenFit production alerts**.

## Dashboard

Для вызовов, runtime errors и latency используй готовые service dashboards
Cloud Functions. В отдельный компактный dashboard добавь пять итоговых метрик
выше столбцами (`max`, без интерполяции пропусков) и виджеты статуса шести
алертов. Для YDB отдельно выведи количество `ydb_retry`, `ydb_slow_operation`
и p95 поля `duration_ms` из `ydb_operation_completed`.

## Cost estimate

- Automatic Yandex Cloud metrics and service dashboards: free.
- Five log-derived metrics at one point per window: less than `0.10 RUB/month`.
- Six continuously evaluated alerts: about `6.48 RUB/month`.
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
