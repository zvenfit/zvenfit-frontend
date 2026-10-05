# Monitoring operations and decisions

Этот документ фиксирует согласованные правила эксплуатации production-monitoring
ZvenFit. Техническое устройство метрик и ручная настройка ресурсов описаны в
[`monitoring.md`](monitoring.md), машиночитаемый semantic desired state — в
[`scripts/monitoring.config.json`](../scripts/monitoring.config.json), а полный
восстанавливаемый snapshot самой борды — в
[`scripts/monitoring.dashboard.json`](../scripts/monitoring.dashboard.json).

## Зафиксированные решения

| Область | Решение |
| --- | --- |
| Product scope | `application=zvenfit-frontend`, `environment=production`; ZvenFit Estetika использует другой application namespace |
| Именование | Глобальные alerts, log metrics и channels получают `ZvenFit · <смысл>`; заголовки графиков внутри dashboard не повторяют `ZvenFit` |
| Компоненты и функции | `service`/`meta.service` определяет компонент, `resource_id` — конкретную функцию |
| Event counts | Дискретные события считаются log-derived metrics |
| Direct metrics | OTLP используется для диагностического heartbeat и состояния Telegram-очереди; direct series ограничивается полным набором `application`, `environment`, `component`, `resource_id`; весь цикл экспорта ограничен единым бюджетом до `5s` с отменой HTTP/HTTPS — см. диагностику ниже |
| Platform signals | Runtime errors, throttling, queue, inflight, memory и duration берутся из managed Cloud Functions metrics |
| SLO | Не внедряется по текущему решению владельца; paging остаётся на фактических потерях и сбоях пользовательских/бизнес-процессов; отказ только direct telemetry — email без повторов |
| No data | `Alarm` только для retry heartbeat, `Warning` для YDB storage, `OK` для событийных и runtime-error сигналов |
| Traffic | Текущая схема stateless; маркетинговые конверсии остаются в маркетинговых счётчиках |
| Новая инфраструктура | Bucket, service account, IAM binding, trigger, function, raw-log export, state storage и Lockbox создаются только после отдельного согласования |
| Lockbox | Не используется и сейчас не нужен |
| CDN query masking | Оставлено вне scope как принятый минимальный риск; отдельный raw CDN pipeline для этого не создаётся |
| Production smoke | Только синтетические записи без персональных данных и только после явного подтверждения; намеренно ронять функции или заполнять production YDB нельзя |

## Taxonomy

| Уровень | Метка | Значения |
| --- | --- | --- |
| Приложение | `application` / `meta.application` | `zvenfit-frontend` |
| Окружение | `environment` / `meta.environment` | `production` |
| Компонент | `service` / `meta.service` | `zvenfit-lead-intake`, `zvenfit-fitbase-schedule`, `zvenfit-site-traffic` |
| Функция | `resource_id` | `zvenfit-telegram-lead`, `zvenfit-fitbase-schedule`, `zvenfit-site-traffic` |

Alerts обязаны иметь `application` и `environment`. Однофункциональные alerts
дополнительно имеют точный component `service` и человекочитаемый `resource_id`;
в Cloud Functions multialert точная функция приходит через label subalert-а
`resource_id`. Статусная зона dashboard использует компактный `alertList` с явным
allowlist полных alert ID из `scripts/monitoring.config.json`. В старом JSON виджета
`widgetScope: "projectId"` заставлял Monium игнорировать прикладной selector и смешивать
alerts разных приложений shared project; это поле и внешний `widget: "alertList"`
возвращать нельзя. Function-графики показывают `resource_id` в legend;
runtime errors и throttling реализованы multialert-ами, разложены по
`resource_id` и группируют уведомления.

Direct gauges выбираются полным набором `application`, `environment`,
`component`, `resource_id`. Селектор только по имени может продолжить выбирать
старую series без taxonomy-меток и дать ложный `No data` после изменения схемы.
Emitter добавляет эти четыре метки ко всем direct-метрикам централизованно;
reusable deploy workflow передаёт их явно. Изменение selector и emitter должно
публиковаться одним коммитом и проверяется unit/config-тестами.

## Где смотреть

| Вопрос | Раздел Monium |
| --- | --- |
| Что сломано сейчас | [Dashboard `ZvenFit · production`](https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/dashboards/zvenfit-production-monitoring) |
| Быстро открыть production-логи | Ссылки `INFO за час` и `ERROR за час` в первой строке dashboard; канонические URL — в [project runbook](../knowledge-base/monitoring-runbook.md#quick-access) |
| Какой alert сработал и для какой функции | [Alerts](https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/alerts) |
| Какие уведомления реально отправились | [Notification feed](https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/notification-feed) |
| Почему сработал application alert | [Raw logs](https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs) |
| Как событие преобразуется в metric | [Log metrics](https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/logs-metrics) |
| Значения конкретной series | [Metrics explorer](https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/explorer) |
| Куда настроена доставка | [Notification methods](https://monium.yandex.cloud/projects/folder__b1ge1e4iopttj79hfdfm/notification-methods) |

Production channels: `ZvenFit · production · Telegram` и
`ZvenFit · production · Email`. Raw logs хранятся 14 дней. Для более старого
инцидента сначала используются alert history, notification feed и metric series.

Если раздел Logs открыт только с `project=folder__b1ge1e4iopttj79hfdfm`,
Monium не выполняет запрос и показывает пустой экран: для raw logs обязательна
метка `service`. Сначала добавь `service=default` и выполни запрос, затем сузь
результат по `meta.application`, `meta.environment`, `meta.service`,
`resource_id`, `meta.event` или `level`. Пустая таблица после выполненного
полного селектора уже означает отсутствие подходящих записей в выбранном окне.

## Desired-state drift

Все семнадцать alerts хранят человекочитаемые названия и taxonomy labels в
`scripts/monitoring.config.json`. Полный native JSON dashboard хранится отдельно
в `scripts/monitoring.dashboard.json`; он не содержит alerts, log metrics или
notification channels и не является входом для drift-check. Канонический
read-only snapshot полного набора live Monium ресурсов сравнивается с Git командой:

```bash
npm run check:monitoring-drift -- --snapshot /path/to/monium-live.json
```

Команда не выполняет сетевых запросов и ничего не изменяет. Exit code `0`
означает совпадение с Git, `1` перечисляет drift по resource ID и полю, `2`
означает некорректный ввод. Экспорт live snapshot остаётся отдельной ручной
read-only операцией: deploy service account не имеет folder-level viewer role,
а private UI API не используется. Автоматизация требует отдельного согласования
read-only IAM и поддерживаемого полного export API для всех monitoring-ресурсов.

Для самой борды поддерживается штатный путь **Настройки → JSON**:

1. Для резервной копии выбрать **Без diff**, скопировать JSON и сохранить его в
   `scripts/monitoring.dashboard.json`.
2. Для восстановления вставить Git-версию в этот же редактор и сначала проверить
   **Встроенный diff**.
3. Нажимать **Применить** только для согласованного изменения live-борды.
4. После применения повторно экспортировать сервер-нормализованный JSON, проверить
   отсутствие секретов/персональных данных и обновить Git-файл.

Monium может перегенерировать внутренние UUID элементов при import; поэтому
источником полного layout служит последний повторный export, а смысловые ожидания
и taxonomy по-прежнему фиксируются в `monitoring.config.json` и тестах.

## Готовые селекторы raw logs

Все production-события ZvenFit:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production"}
```

Приём заявок и Telegram:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", meta.service="zvenfit-lead-intake"}
```

Расписание/Fitbase:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", meta.service="zvenfit-fitbase-schedule"}
```

Технический трафик сайта:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", meta.application="zvenfit-frontend", meta.environment="production", meta.service="zvenfit-site-traffic"}
```

К component selector добавляется `meta.event`, `meta.request_id`, `level` или
`meta.error_code`. Безопасные диагностические поля ошибки:
`meta.error_type`, `meta.error_code`, `meta.retriable`, `meta.upstream_status`,
`meta.stack_fingerprint`. Имена, телефоны, request/response body, authorization
headers и секреты в application logs не записываются.

Необработанные runtime-ошибки расписания:

```text
{project="folder__b1ge1e4iopttj79hfdfm", cluster="default", service="default", resource_type="serverless.function", resource_id="d4e80noc1hjn2g8u0beq", level="ERROR", message!=*"Code: 499"}
```

Клиентские отмены расписания отделены фильтром `message=*"Code: 499"`.
Synthetic smoke records помечаются `meta.synthetic=true` и
`meta.source="monitoring-smoke-test"`.

## Runtime-ошибки и лимиты по функциям

| Функция | Runtime-сигнал | Где видна функция | Paging |
| --- | --- | --- | --- |
| `zvenfit-telegram-lead` | managed `functions_errors` | subalert `resource_id=zvenfit-telegram-lead` | `zvenfit_function_runtime_errors` |
| `zvenfit-fitbase-schedule` | managed `functions_errors`; дополнительно `zvenfit_fitbase_errors_5m` для обработанных ошибок и `zvenfit_schedule_runtime_errors_1m` для необработанных | subalert `resource_id=zvenfit-fitbase-schedule` | общий runtime multialert плюс два schedule application/runtime alerts |
| `zvenfit-site-traffic` | managed `functions_errors` | subalert `resource_id=zvenfit-site-traffic` | `zvenfit_function_runtime_errors` |

Runtime errors и throttling всех трёх функций покрывают два multialert-а,
разложенных по `resource_id`; уведомление показывает конкретную функцию, а
события одного вычисления отправляются группой. Queue, inflight, memory и duration
также разделены по `resource_id` и используются как диагностические графики.
Runtime-error multialert агрегирует managed `functions_errors` через `max` за 5 минут:
одна ошибка остаётся критической, но повторные `DGAUGE`-точки не выглядят как несколько
независимых invocation. Их точное число определяется по системным Request ID в raw logs.
Основной latency-график строит p95 из managed `duration_ms_histogram`; max duration
на production-борде заменён, чтобы единичный выброс не искажал основной сигнал. Log-derived
`zvenfit_retry_worker_log_heartbeat_1m` — основной независимый от OTLP paging-
сигнал активности retry-worker; direct gauge остаётся диагностическим.
`zvenfit_monium_metrics_failures_5m` считает ошибки инициализации/экспорта OTLP
по Cloud Logging, поэтому alert на него не зависит от контролируемого export path.
Alert использует окно `30m` и пороги `>2`/`>5`: одиночный сетевой таймаут
остаётся диагностикой. Alert доставляется только по email, без повторов и без
Telegram paging. В live-форме отсутствие повторов задаётся `0s` и отображается
как «Никогда»; уровень карточки — `Info`, потому что отдельного уровня `Warning`
у Monium нет. Сбор, отправка, `forceFlush()` и `shutdown()` используют единый
бюджет до `5s` (см. диагностику ниже). События содержат `outcome`,
`duration_ms`, `error_type`, `error_code` и фазу `phase` (`collect`, `export`,
`force_flush`, `shutdown`) без исходного текста ошибки.
YDB SQL latency считается только по фазе `query_execute`; медленные
`session_acquire` и `session_create` выводятся отдельным диагностическим
графиком без paging-alert. Read-only проверки retry-worker повторяют
transient session/query failure с backoff в пределах общего бюджета
(по умолчанию 10 секунд; [политика повторов](monitoring.md#alerts)).
Write-path заявки не повторяется этим механизмом. Единичный `ydb_slow_operation` остаётся только на
графике, два события за `10m` дают `Warning`, три — `Alarm`.

### Зависание после завершения retry-worker: диагностика 28 сентября 2026

В прочитанных production-логах функции `zvenfit-telegram-lead` два разных
Request ID завершились системным `504 Execution timeout exceeded` после 120 секунд:
28 сентября в **15:50:32** и **16:03:01 МСК**. Оба запуска использовали версию
`d4eg3tbffui7c7bbl693`. Для тех же Request ID ранее записаны
`retry_worker_completed` в **15:48:34** и **16:01:01** соответственно,
с `queue_pending=0`, `processed=0`, `failed=0`. После них в этих запусках не было
`monium_metrics_export_completed` или `monium_metrics_export_error`.
Семь ошибок чтения YDB за день относятся к другим Request ID; их нельзя считать
прямой причиной этих двух таймаутов.

До исправления локальное воспроизведение от 1 октября использовало реальный
handler, `createInvocationMetrics`, сбор метрик SDK и `createOtelTransport`,
с пустой синтетической очередью и подменённым экспортёром. Виртуальные часы показали:

| Подмена | Через 5 секунд | Через 120 секунд | Событие результата экспорта |
| --- | --- | --- | --- |
| Не завершается `forceFlush()` после успешной отправки | handler ожидает | handler ожидает | отсутствует |
| Не завершается `shutdown()` после успешной отправки | handler ожидает | handler ожидает | отсутствует |
| Не приходит callback отправки, затем не завершается `shutdown()` | handler ожидает | handler ожидает | отсутствует, хотя таймаут отправки уже сработал |

Настоящий `OTLPMetricExporter` **0.221.0** также воспроизвёл зависание: локальный
сервер присылал фрагмент ответа каждые 25 мс, и при бюджете 500 мс flush всё ещё
ожидал через 1500 мс. В исходниках SDK `req.setTimeout()` ограничивает бездействие сокета,
а `shutdown()` сначала ждёт незавершённые отправки через `forceFlush()`.
Поступление фрагментов ответа поддерживает активность сокета, поэтому таймаут
callback сам по себе не освобождает весь цикл. Это соответствует
[семантике таймаута HTTP в Node.js](https://nodejs.org/api/http.html#requestsettimeouttimeout-callback).
[`agent.destroy()`](https://nodejs.org/api/http.html#agentdestroy) закрывает
существующие сокеты; эксперимент подтвердил, что это не постоянный запрет новых отправок.

Отдельный эксперимент обнаружил отличие версий Node.js: сокет с уже отменённым
`AbortSignal` в опциях уничтожает себя ещё в конструкторе, а `ClientRequest` в
Node.js **22** подписывается на ошибки сокета только на следующем тике (в **24** —
синхронно), поэтому на 22.23.3 поздняя инициализация и повтор давали
необработанный `AbortError`. Поэтому сигнал в сокеты не передаётся: открытые
соединения закрывает `agent.destroy()`, а новые подключения после отмены
отклоняются в публичном `agent.createConnection()` до создания сокета, отказ
возвращается через callback. Нельзя переносить в production вариант,
проверенный только на Node.js 24.

Реализация в [`otel-transport.ts`](../functions/lead-intake/src/observability/otel-transport.ts)
использует один deadline на весь flush. SDK создаётся после сбора и получает
только остаток бюджета. На таймауте сначала фиксируется `metrics_export_timeout`,
затем отменяются принадлежащие invocation агенты из
[`metrics-agent.ts`](../functions/lead-intake/src/observability/metrics-agent.ts).
Новые подключения после отмены запрещены для HTTP и HTTPS, включая отложенную
инициализацию и повтор с уже закешированным agent. `shutdown()` запускается один
раз даже при зависшем `collect`/`forceFlush`; ожидание cleanup не продлевает deadline.
Поздние Promise rejection обработаны, успешный callback после таймаута не меняет
исход, а `createInvocationMetrics` пишет единственный итоговый лог. Бюджет
проверяется перед запуском сетевой фазы; если все фазы успели завершиться до
срабатывания deadline, итог не подменяется таймаутом.

Внутренний retry-таймер SDK нельзя снять через публичный API. Если он всё же
просыпается после отмены, agent отклоняет запрос до создания сокета; функция его
не ждёт. Таймеры JavaScript не дают гарантии реального времени при блокировке
event loop, но новые фазы также проверяют истечение бюджета перед запуском.

Регрессионные проверки:

- [`otel-transport.test.ts`](../functions/lead-intake/src/observability/__tests__/otel-transport.test.ts):
  три сценария зависания из таблицы выше (`forceFlush()`, `shutdown()`, отсутствие
  callback отправки вместе с `shutdown()`) проверяются обычными тестами: handler
  возвращает исходный результат очереди через 5 секунд, а лог таймаута называет
  фазу. Проверяются общий бюджет после
  медленного сбора, запрет позднего экспорта, единственный shutdown и поздние ошибки.
- [`integration/otel-transport.test.ts`](../functions/lead-intake/src/observability/__tests__/integration/otel-transport.test.ts):
  настоящий SDK на loopback по HTTP и HTTPS. Проверяются молчание, незавершённый
  ответ, отложенная инициализация, поздний повтор, зависший TLS handshake,
  отклонение недоверенного сертификата и успешная следующая отправка после отмены.
  HTTPS использует временный сертификат, доверенный только соответствующему
  тестовому agent; ключ создаётся через OpenSSL и удаляется после прогона.
  Синтетические метрики не отправляются в Monium.

Loopback-набор входит в `npm run test:lead-fn` (проверка `lead-function` в
`project-checks.json`), поэтому выполняется и в PR quality workflow, и в релизном
workflow перед деплоем. Ему нужны только OpenSSL CLI и loopback-сокеты; внешняя
сеть не используется. Отдельный повторный запуск:
`npm --prefix functions/lead-intake run test:metrics-http`.

Production runtime — `nodejs22`; CI выполняет эти проверки на Node.js 22, локальная
разработка может идти на более новой версии. Поведение agent с уже отменённым
`AbortSignal` отличается между Node.js 22 и 24 (см. выше), поэтому зелёный
`quality` на Node.js 22 — обязательная часть проверки этого исправления.

Подтверждён пробел в ограничении времени всего цикла экспорта, воспроизведённый
также с настоящим SDK. Последовательность локальных событий согласуется с
production-логами, но не доказывает, какой именно сетевой сценарий произошёл
28 сентября. Детализации фаз экспорта в тех логах не было; после исправления
`monium_metrics_export_error` содержит поле `phase`. Исправление кода требует
обычного релиза со staging/E2E gate; локальные проверки не подтверждают rollout
в Cloud Functions. Настройки алертов, execution timeout и YDB не меняются.

Проверка после релиза (production, `resource_id=zvenfit-telegram-lead`): в первые
часы за каждым `retry_worker_completed` новой версии должен следовать ровно один
из `monium_metrics_export_completed` / `monium_metrics_export_error`; `duration_ms`
таймаутов не превышает ~5100; системных `Execution timeout exceeded` у функции
нет. Окончательное подтверждение даст следующая деградация Monium (как
30 сентября): всплеск `monium_metrics_export_error` без invocation длиннее
нескольких секунд.

### Таймауты открытия сессии YDB 28 сентября 2026

Read-only расследование 1 октября сопоставило все семь `ydb_operation_failed`
за полные сутки 28 сентября (МСК) с `retry_worker_deferred`, `START`, `END`
и системным `REPORT` по тем же Request ID. Все использовали версию
`d4eg3tbffui7c7bbl693`, созданную 27 сентября в 01:20 МСК.

| Время ошибки, МСК | Request ID | Длительность invocation по REPORT, мс |
| --- | --- | ---: |
| 15:43:50.352 | `82667e12-50bf-4e38-a980-2a7590975159` | 21989.202 |
| 15:46:09.948 | `fa6dfa77-b99f-4061-8e60-89d7ea2fe13c` | 22310.692 |
| 15:54:58.347 | `bb904cf9-7e2f-4854-af31-5138df5e6436` | 22099.883 |
| 15:59:55.376 | `6f09c2f9-5b47-434b-98e5-2cb96cae1b26` | 22199.890 |
| 16:02:06.427 | `050f61a2-5f5a-4f67-92d2-ef97a63efc1f` | 22484.551 |
| 16:05:56.232 | `1f63cf33-c027-4189-8183-ff33e087c301` | 22365.999 |
| 16:11:40.506 | `04fab4d1-4435-442f-91e3-b662c4e9dcd6` | 22340.106 |

У всех семи одинаковый сценарий: `operation=list_telegram_candidates`,
`error_code=ydb_read_budget_exhausted`, `phase=session_create`,
`phase_source=active_trace`, `query_execute_attempts=0`, `retry_attempts=1`.
Само чтение ограничилось 20001–20003 мс. Завершённая первая session-фаза заняла
10002–10007 мс; активная вторая — 9305–9471 мс до отмены общего бюджета.
Счётчик `session_create_attempts=1` учитывает завершённые trace: незавершённая
вторая попытка отражена в `failed_phase_duration_ms`, а не в этом счётчике.
Каждый worker записал `stage=delivery`, `reason=queue_read_unavailable` и
завершился за 22–22.5 секунды, без системного 120-секундного таймаута.
В `REPORT` есть Function Init Duration 221–309 мс; память 140–149 из 256 МБ.

Для каждого сбоя найден следующий `retry_worker_completed`: соответственно
15:44:35.168, 15:46:27.504, 15:55:49.962, 16:01:01.745, 16:02:47.721,
16:06:42.864 и 16:12:23.934 МСК. Интервал от ошибки до успешной проверки —
18–67 секунд; во всех семи `queue_pending=0`, `oldest_pending_age_seconds=0`,
`processed=0`, `failed=0`. Такие же нулевые значения проверены перед серией
в 15:42:27.788 и после неё в 16:14:38.669. Накопление очереди в этих снимках
не наблюдается. Успешный worker в 16:01:01 относится к отдельному invocation,
который позже завис при финализации (см. предыдущий раздел): успешная проверка
очереди сама по себе не доказывает успешный возврат handler.

Повторный запрос `meta.event="ydb_operation_failed"` с тем же production
`resource_id` за период с 29 сентября 00:00 до текущей проверки 1 октября
21:17 МСК вернул «Нет записей по вашему запросу». Это проверка указанного
события в логах, не проверка доставки каждой заявки и не постоянный мониторинг.

В актуальной на 1 октября версии `d4e3h5q89p3t157sbdqb` через консоль прочитаны
только несекретные параметры: `YDB_QUERY_TIMEOUT_MS=10000`,
`YDB_SESSION_POOL_SIZE=5`, `YDB_SLOW_OPERATION_MS=1000`. Формула в
[`context.ts`](../functions/lead-intake/src/ydb/context.ts) —
`min(2 * queryTimeoutMs(), 20000)`. Поэтому текущая конфигурация даёт 20 секунд,
а значение по умолчанию 5000 — 10 секунд. Историческое окружение версии
27 сентября напрямую не прочитано; её длительности согласуются с таймаутом
10000, но текущие настройки сами по себе не доказывают исторические значения.

`session_create` не локализует отдельный RPC. В установленном
`@ydbjs/query 6.3.0` `Session.open()` включает `CreateSession` и ожидание первого
сообщения `AttachSession`; это описано и в
[документации SDK](https://github.com/ydb-platform/ydb-js-sdk/blob/main/packages/query/README.md#observability-via-nodediagnostics_channel).
Локальный эксперимент на Node.js 22.23.3 с настоящим SDK и синтетическим
RPC-клиентом отдельно задерживал каждую из этих двух фаз. При query timeout
1000 мс и read budget 2000 мс оба варианта дали `ydb_read_budget_exhausted`,
`session_create/active_trace`, один повтор и ноль SQL-выполнений. После отмены
следующий `SELECT 1` успешно прошёл с тем же пулом; для сценария AttachSession
SDK вызвал cleanup обеих созданных сессий. Эксперимент не подключался к YDB и
не отправлял метрики наружу. Он доказывает неоднозначность диагностики,
а не конкретную сетевую причину production-инцидента.

Вывод по коду и логам: защитный read budget и отложенный проход сработали;
эти семь запусков не дошли до SQL и изменения очереди. Это не доказательство
отсутствия задержек для всех заявок за день. `upstream_status=null` не позволяет
назначить причиной перегрузку YDB, IAM, сеть или SDK. Лимит пула также не
подтверждён как причина: активная фаза была открытием новой сессии, а не только
ожиданием свободного места.

Следующий отдельный шаг по YDB — диагностировать границу `CreateSession` /
первый ответ `AttachSession` и сохранять безопасные поля предыдущей ошибки
повтора при итоговом исчерпании бюджета. Сейчас `operation.retryFailure`
собирается, но выводится только в успешном `ydb_retry`; итоговый failure её
не включает. Для диагностики достаточно RPC-фазы, длительности, статуса,
параметров бюджета и состояния пула; SQL, параметры заявки, токены и полные
тексты ошибок логировать не нужно. Увеличение таймаута/пула или сброс общего
driver по каждому таймауту не обоснованы собранными данными. Этот разбор не
меняет YDB-код, настройки облака или порядок релиза исправления OTLP. Шаг
зафиксирован в [`TODO.md`](../TODO.md), раздел «Infra / DX».

## Разбор срабатывания

При `ydb_retry` сначала сравни `retry_source`, `error_code`, `phase` и
`failed_phase_duration_ms`. `duration_ms` включает всю операцию и повторы;
`query_execute_max_duration_ms` показывает самую медленную query-фазу.
Событие означает успешное восстановление. Если повторов несколько, поля
ошибки относятся к последнему из них. `phase_source=error_trace` означает trace
ошибки, `active_trace` — снимок активной фазы при отмене до завершения trace.
`phase=unknown` означает отсутствие соответствующего SDK trace, а не
установленную проблему с query или session. При `ydb_read_budget_exhausted`
общий бюджет чтения истёк: это ошибка invocation, а не успешное восстановление.
В `telegram_delivery_retry_scheduled` поле `telegram_phase` отличает проверку
маршрута от самой отправки. Для старых записей этих полей может не быть.

1. В alert записать время перехода, `service`, `resource_id`, окно и evaluation
   delay. Для multialert открыть конкретный subalert.
2. На dashboard проверить соседние signals той же функции: errors, throttles,
   queue, inflight, memory и duration.
3. Открыть raw logs на alert window с запасом на delay. Сначала выбрать
   component, затем сузить по `event`, `request_id`, `level` или `error_code`.
4. Для log-derived alert сверить source selector/grouping и выходную series.
   Поставка log aggregates может занимать до трёх минут.
5. Для direct gauges сопоставить heartbeat/backlog с `retry_worker_completed` и
   основным log-derived heartbeat. При `monium_metrics_export_error` проверить
   `error_type`, `error_code`, `duration_ms`, график exporter failures и
   длительность функции; для managed metrics искать подтверждение на соседних
   platform-графиках.
6. После восстановления проверить переход `OK` и доставку в Telegram и email.
   Для `zvenfit_monium_metrics_failures` ожидается только одно email-уведомление:
   Telegram и повторная отправка для него намеренно отключены.

Empty event graph при зелёном alert — нормальное состояние. Порог не ослабляется
по одному шумному срабатыванию: сначала проверяются raw logs, series, окно и
delay, затем desired state, тесты и live drift.

## Увеличение срока хранения для двухнедельных разборов

18 сентября 2026 владелец согласовал увеличение retention существующей группы
`default` (`e23fnr42117phjg4r2oe`) с 72 до 336 часов (14 суток).
Desired state в `monitoring.config.json` — 14 дней. Изменение действует на всю
log group, включая access-like поля traffic-функции и записи других её
источников. Уже истёкшие логи не восстановятся; полная двухнедельная история
накопится со временем.

Применение и проверка:

```bash
yc logging group get --id e23fnr42117phjg4r2oe --format json
yc logging group update --id e23fnr42117phjg4r2oe --retention-period=336h
yc logging group get --id e23fnr42117phjg4r2oe --format json
```

Ожидаемое значение после изменения — `retention_period=1209600s`.
При последующих изменениях синхронно обновлять `source.retentionDays`,
соответствующий config-тест и описания retention в `monitoring.md` и project
runbook; затем выполнять `npm run test:monitoring`. Не создавать новую log group и не переносить функции
в рамках этого изменения. Возврат к 72 часам сокращает доступную историю и
тоже требует осознанного решения.

Параметр CLI принимает часы, минуты или секунды, а не дни:
[документация Yandex Cloud](https://yandex.cloud/ru/docs/logging/operations/retention-period).
Стоимость зависит от объёма записи и хранения:
[тарификация Cloud Logging](https://yandex.cloud/ru/docs/logging/pricing).

## Правила изменения

- Любое изменение сначала вносится в `scripts/monitoring.config.json` и
  документацию, затем проверяется тестами и live-конфигурацией. Изменение самой
  борды дополнительно завершается повторным export в
  `scripts/monitoring.dashboard.json`.
- Любой новый infrastructure element отдельно согласовывается с владельцем.
- Deploy marker не добавляется без отдельного write-path: у deploy SA нет metric
  writer, а расширять использование runtime `MONIUM_API_KEY` на CI нельзя молча.
- Любое изменение KB проверяется на секреты и персональные данные до коммита.
- Project KB в `knowledge-base/` — version-controlled документация: она
  коммитится и публикуется только в настроенный Git remote этого проекта.
  Отдельная синхронизация в Wiki, DataCatalog или другие KB-системы запрещена.
