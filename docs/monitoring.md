# Monitoring and alerts

Минимальный мониторинг production-функций. Lead/schedule logs не содержат
персональные данные; traffic log намеренно access-like и описан отдельно ниже.
Машиночитаемый источник конфигурации: `scripts/monitoring.config.json`.

Согласованные правила эксплуатации, единая taxonomy, прямые ссылки Monium,
готовые log-селекторы и порядок разбора инцидента вынесены в
[`monitoring-operations.md`](monitoring-operations.md).

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
| CDN resource              | `bc8rubabuwzpqqp7rifz`            |
| Traffic function          | `zvenfit-site-traffic`            |
| Cloud Logging retention   | 3 days                            |

Project dashboard: <https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/dashboards/zvenfit-production-monitoring>

Cloud Logging автоматически показывает свои записи в Monium. Открыть логи:

<https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs>

Базовый селектор:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production"}
```

## Техническая посещаемость сайта

Это инфраструктурная аналитика внутри Yandex Cloud, не замена Яндекс Метрике или
Top.Mail.Ru. Она отвечает на эксплуатационные вопросы: сколько запросов и
просмотров пришло на CDN, сколько из них похоже на людей, роботов, автотесты или
сканеры, и как ведут себя cache/status/latency.

На каждой HTML-странице build добавляет небольшой beacon. Он отправляет один
POST в stateless-функцию `zvenfit-site-traffic`, а функция пишет structured
event `site_page_view` в Cloud Logging. Monium считает page views прямо из этих
логов и делит их на четыре взаимоисключающих класса:

- `browser_like` — обычный browser-like User-Agent без признаков автоматизации;
- `known_bot` — известные поисковые, preview и social bots;
- `synthetic` — наши production smoke checks с User-Agent
  `ZvenFit-Synthetic-Monitor/1.0`;
- `unknown` — curl, нестандартные клиенты и User-Agent без достаточных признаков
  обычного браузера.

Классификация эвристическая: технически невозможно гарантированно распознать
хорошо замаскированного робота по User-Agent. Кроме того, beacon видит только
клиентов, исполнивших JavaScript. Поэтому `known_bot` — не полный объём роботов,
а разница между `edge.requests` и page views не равна числу ботов: в CDN requests
также входят assets и клиенты с заблокированным JavaScript.

| Metric | Что считается |
| --- | --- |
| `edge.requests` | Все CDN-запросы, включая HTML, assets и роботов |
| `zvenfit_site_page_views_by_class_5m` | Валидные browser beacon events по `traffic_class` и `host` |
| `edge.requests_status` | Встроенная разбивка CDN по HTTP status |
| `edge.requests_cache_status` | Встроенная разбивка CDN по cache status |
| `edge.bytes_sent` | Встроенная скорость отдачи CDN |
| `edge.request_time_seconds` | Встроенные перцентили latency CDN |

Селекторы для графиков:

```text
edge.requests{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.requests_status{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.requests_cache_status{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.bytes_sent{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.request_time_seconds{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
```

Access-like event сохраняет IP, полный User-Agent, полный URL с query,
referrer, `page_view_id` и признак `webdriver`. Это осознанный диагностический
лог с общей retention Cloud Logging 3 дня. Сырые поля нельзя добавлять в labels
метрики: grouping ограничен `traffic_class` и `host` — максимум 12 штатных
рядов. Нормализованный `page` остаётся полем лога, потому что произвольные 404
пути сделали бы его небезопасной высококардинальной label.

Отдельного client state нет: функция не использует HMAC, Lockbox, YDB, Object
Storage, cookies или session timeout. `page_view_id` нужен только для поиска
повторной доставки в логах; sessions и unique visitors не считаются.

Настройка функции, log-based metric и карточки **Последний page view** описана в
[`site-traffic-analytics.md`](site-traffic-analytics.md). Карточка freshness
диагностическая, без paging-alert. Пользовательский dashboard Monium не встраивает
raw-log строки, поэтому плитка показывает последнее значение объединённой
пятиминутной метрики; точный timestamp события смотри в Cloud Logging.

## События приложения

Lead и schedule функции пишут только технические идентификаторы и коды ошибок.
Имя, телефон, Telegram username, UTM и тело ответа Fitbase в их лог не попадают.
Traffic-функция отдельно пишет перечисленные выше access-like поля.

Все три функции используют Pino с адаптером под structured logging Yandex Cloud:
уровни записываются как `ERROR/WARN/INFO`, каждый вызов получает `request_id`.
Lead/schedule автоматически скрывают известные поля с PII, телами запросов и
секретами. Traffic logger сохраняет согласованные access-like поля, но по-прежнему
редактирует authorization headers. Уровень задаёт `LOG_LEVEL`, по умолчанию `info`.

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
| `ydb_retry`                            | YDB-клиент повторил операцию после временной ошибки          | Warning    |
| `site_page_view`                       | Beacon страницы принят и классифицирован                     | Diagnostic |
| `ydb_slow_operation`                   | Операция YDB превысила `YDB_SLOW_OPERATION_MS`               | Warning    |
| `ydb_operation_failed`                 | Операция YDB завершилась ошибкой                             | Critical   |
| `fitbase_schedule_error`               | Fitbase вернул ошибку или недоступен                         | Warning    |
| `fitbase_schedule_misconfigured`       | Для production Fitbase provider отсутствует token            | Critical   |

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

### 8. Rate limiter health errors

- ID: `zvenfit_rate_limit_errors_5m`
- Window: 5 minutes
- Selector:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", message=*"lead_rate_limit_error"}
```

### 9. Schedule runtime errors

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

### 10. Schedule client cancellations

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

Исходные логи читаются из `service="default"`, а созданные агрегаты
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

Создай пятнадцать обычных алертов. Мгновенные critical/health-сигналы lead
pipeline используют прямые OTLP-метрики приложения; сигналы, где пороги должны
считать события, используют log aggregates. Fitbase также использует агрегат
application logs, runtime и retry trigger — автоматические метрики Cloud
Functions, storage alert — две автоматические метрики YDB:

| Alert ID                              | Metric / signal                              | Function | Warning |   Alarm | Window | Delay | No data |
| ------------------------------------- | -------------------------------------------- | -------- | ------: | ------: | -----: | ----: | ------- |
| `zvenfit_lead_storage_errors`         | direct `zvenfit_lead_storage_errors`         | `max`    |   `> 0` | `> 0.5` |     5m |   30s | OK      |
| `zvenfit_permanent_telegram_failures` | direct `zvenfit_telegram_delivery_failed_1m` | `max`    |   `> 0` | `> 0.5` |     5m |   30s | OK      |
| `zvenfit_fitbase_errors`              | log aggregate `zvenfit_fitbase_errors_5m`    | `max`    |   `> 0` | `> 0.5` |    10m |    3m | OK      |
| `zvenfit_function_runtime_errors`     | `functions_errors` for lead function | `sum`   |   `> 0` | `> 0.5` |     5m |   30s | OK      |
| `zvenfit_schedule_runtime_errors`     | log aggregate `zvenfit_schedule_runtime_errors_1m` | `max` |   `> 0` | `> 0.5` |     5m |    3m | OK      |
| `zvenfit_schedule_cancellations`      | log aggregate `zvenfit_schedule_client_cancellations_5m` | `sum` | `> 0` | `> 9.5` |    10m |    3m | OK      |
| `zvenfit_ydb_retries`                 | log aggregate `zvenfit_ydb_retries_5m`       | `sum`    | `> 4.5` | `> 5.5` |    10m |    3m | OK      |
| `zvenfit_slow_ydb_operations`         | log aggregate `zvenfit_ydb_slow_operations_5m` | `sum`  | `> 0.5` | `> 2.5` |    10m |    3m | OK      |
| `zvenfit_rate-limited_leads`          | log aggregate `zvenfit_lead_rate_limited_5m` | `sum`    |   `> 0` |   `> 5` |    10m |    3m | OK      |
| `zvenfit_persisted_leads_volume`      | log aggregate `zvenfit_leads_persisted_5m`   | `sum`    |  `> 10` |  `> 20` |    10m |    3m | OK      |
| `zvenfit_retry_worker_heartbeat`      | direct `zvenfit_retry_worker_heartbeat`      | `last`   | `< 0.9` | `< 0.5` |     5m |   30s | Alarm   |
| `zvenfit_telegram_delivery_backlog`   | direct oldest pending age, seconds           | `last`   | `> 600` | `> 1800` |    5m |   30s | OK      |
| `zvenfit_rate_limit_health_errors`    | log aggregate `zvenfit_rate_limit_errors_5m` | `sum`    |   `> 0` |   `> 2` |    10m |    3m | OK      |
| `zvenfit_retry_trigger_errors`        | trigger access and invocation errors         | `max`    |   `> 0` | `> 0.5` |     5m |   30s | OK      |
| `zvenfit_ydb_storage_usage`           | query `C`, storage used percent              | `last`   | `>= 70` | `>= 85` |    15m |   30s | Warning |

Monium требует `Alarm > Warning`. Для целочисленных счётчиков промежуточное
значение `0.5` техническое. Для error counters первая точка со значением `1`
сразу даёт `Alarm`; для slow YDB пороги намеренно разведены: единичное превышение
даёт `Warning`, а `Alarm` требует минимум три превышения за 10 минут. Для
клиентских отмен первая точка даёт только `Warning`, а `Alarm` требует десять
отмен за 10 минут. Heartbeat в норме всегда равен `1`; его основная проверка —
политика `No data = Alarm`. Прямые и platform metrics используют задержку
вычисления `30s`, а все log aggregates — `3m`, чтобы дождаться поставки логов.

Приложение экспортирует event counters с `DELTA` temporality. Каждая инвокация
serverless-функции создаёт отдельный одноразовый MeterProvider, а Monium
нормализует такую точку до rate за короткий интервал жизни provider. Поэтому
прямые event counters подходят для условия «событие было» (`max > 0`), но не для
порогов, которые должны считать события через `sum`: единичная точка может стать
значением больше `1`. Все count-sensitive alerts выше намеренно читают log
aggregates с настоящей агрегацией `count`.

Это подтверждено инцидентом 2026-08-14: одна `ydb_slow_operation`, экспортированная
за 155 мс, дала direct metric `6.4516129` (`1 / 0.155`) и ложный `Alarm` вместо
`Warning`. Log aggregate сохраняет для неё значение `1`. Latency операции
измеряется после готовности YDB-клиента, чтобы холодное создание driver не
выглядело как медленный SQL-запрос. Порог `YDB_SLOW_OPERATION_MS` относится
именно к выполнению операции после инициализации клиента.

Селектор прямой метрики ошибки сохранения:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="zvenfit-frontend", name="zvenfit_lead_storage_errors"}
```

Lead-функция продолжает отправлять девять диагностических event-метрик и одну
dashboard-метрику напрямую в Monium по OTLP с `service="zvenfit-frontend"`.
Алерты ошибок хранения и permanent Telegram failure используют direct-сигналы
для минимальной задержки; count-sensitive alerts используют log aggregates.
Health-сигналы:

- `zvenfit_retry_worker_heartbeat` — успешное завершение минутного retry pass;
- `zvenfit_telegram_pending_leads` — текущий размер очереди для dashboard;
- `zvenfit_telegram_oldest_pending_age_seconds` — возраст старейшей ожидающей заявки;
- `zvenfit_rate_limit_errors_5m` — недоступность fail-open rate limiter.

Heartbeat записывается только после retry pass и read-only проверки очереди.
Если timer не вызвал функцию, YDB недоступна или OTLP export перестал работать,
точки исчезнут и heartbeat alert перейдёт в `Alarm`. Для записи используется
GitHub Secret `MONIUM_API_KEY`: API key runtime SA с ролью
`monium.metrics.writer` и scope `yc.monium.metrics.write`.

Read-only операции `list_telegram_candidates` и `get_telegram_queue_health`
один раз повторяют `AbortError` через новую query и свежую YDB session. Успешное
восстановление пишет `ydb_retry`; повторный abort по-прежнему завершает invocation
ошибкой и попадает в runtime alert.

Fitbase не использует `functions_errors` как основной application alert: handler
перехватывает недоступность upstream и возвращает контролируемый HTTP `502`, то
есть invocation может считаться успешно завершённым. Поэтому
`zvenfit_fitbase_errors` проверяет созданный log aggregate:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="logging_aggregates", name="zvenfit_fitbase_errors_5m"}
```

Селектор автоматической метрики runtime errors только для критичной lead-функции:

```text
{project="folder__b1ge1e4iopttj79hfdfm", service="serverless-functions", name="functions_errors", resource_id="zvenfit-telegram-lead"}
```

Несмотря на название метки, live Monitoring API возвращает в `resource_id`
имена функций, а не их облачные ID `d4e…`. Селектор проверен по фактическим
сериям `functions_errors` production-функций.

Schedule runtime и client cancellations используют отдельные log aggregates:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="logging_aggregates", name="zvenfit_schedule_runtime_errors_1m"}
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="logging_aggregates", name="zvenfit_schedule_client_cancellations_5m"}
```

Для POST заявки `499` намеренно не исключается: разрыв клиента может произойти
до записи в YDB. Автоматическая `functions_errors` расписания остаётся на service
dashboard для общего анализа, но критический schedule alert использует
отфильтрованный агрегат, чтобы клиентские отмены не маскировали runtime failures.

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

Общий диагностический график **Ошибки Cloud Functions** считает встроенную
`functions_errors` для `zvenfit-telegram-lead`, `zvenfit-fitbase-schedule` и
`zvenfit-site-traffic`. Для `zvenfit-site-traffic` это только diagnostic-сигнал:
он не входит в критичный `zvenfit_function_runtime_errors` и не создаёт paging.
Контролируемые HTTP `400/403/405/413` не являются runtime failures и в этот
график не попадают.

Для сайта используй компактный dashboard Monium: `edge.requests`, page views,
доли `browser_like` / `known_bot` / `synthetic` / `unknown` и карточку
**Последний page view**. Sessions пока не считаются. Cache/status/bytes/latency
оставь на встроенных `edge.*` графиках Monitoring. Маркетинговые конверсии и
источники кампаний остаются в маркетинговых счётчиках.

Плитка **Последний page view** использует `series_sum` для объединения рядов
`traffic_class × host` и агрегацию `last`. Она показывает последнее значение
пятиминутного bucket в выбранном диапазоне, а не timestamp raw-log записи. Это
намеренная диагностическая аппроксимация без новой метрики, state и alert.

## Cost estimate

- Automatic Yandex Cloud metrics and service dashboards: free.
- Eleven log-derived metrics at one point per window: well below `1 RUB/month`
  at the current cardinality.
- Fifteen continuously evaluated alerts: about `16.20 RUB/month` at the current
  tariff of `1.5 RUB / 1000 alert-hours`.
- Telegram and email notification channels: no separate charge; SMS and calls
  are not enabled.
- Cloud Functions and Cloud Logging should remain within their shared billing-
  account free tiers at the current traffic. The log group retains three days.
- Paid CDN log export, Query and DataLens are not used.
- No runtime service account, Object Storage trigger, Lockbox secret, HMAC,
  session state or custom metric writes are required.

## Verification

Run the monitoring contract tests before deployment:

```bash
npm run test:lead-fn
npm run test:schedule-fn
npm run test:site-traffic
npm run test:monitoring
```

The tests verify exact event IDs, the `Code: 499` split between the two platform
log selectors, and that the Fitbase response body is not written to logs.
