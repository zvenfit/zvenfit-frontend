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
| Direct metrics | OTLP используется для heartbeat и состояния Telegram-очереди; direct series ограничивается полным набором `application`, `environment`, `component`, `resource_id` |
| Platform signals | Runtime errors, throttling, queue, inflight, memory и duration берутся из managed Cloud Functions metrics |
| SLO | Не внедряется по текущему решению владельца; paging остаётся на фактических потерях/сбоях и технических причинах |
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
`resource_id`. Общий alert-list остаётся плоским и фильтруется по
application/environment. Function-графики показывают `resource_id` в legend;
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
`ZvenFit · production · Email`. Raw logs хранятся три дня. Для более старого
инцидента сначала используются alert history, notification feed и metric series.

Если раздел Logs открыт только с `project=folder__b1ge1e4iopttj79hfdfm`,
Monium не выполняет запрос и показывает пустой экран: для raw logs обязательна
метка `service`. Сначала добавь `service=default` и выполни запрос, затем сузь
результат по `meta.application`, `meta.environment`, `meta.service`,
`resource_id`, `meta.event` или `level`. Пустая таблица после выполненного
полного селектора уже означает отсутствие подходящих записей в выбранном окне.

## Desired-state drift

Все шестнадцать alerts хранят человекочитаемые названия и taxonomy labels в
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
Основной latency-график строит p95 из managed `duration_ms_histogram`; max duration
на production-борде заменён, чтобы единичный выброс не искажал основной сигнал. Log-derived
`zvenfit_retry_worker_log_heartbeat_1m` отдельно подтверждает поставку structured
events и не создаёт второй paging-сигнал.
YDB SQL latency считается только по фазе `query_execute`; медленные
`session_acquire` и `session_create` выводятся отдельным диагностическим
графиком без paging-alert.

## Разбор срабатывания

1. В alert записать время перехода, `service`, `resource_id`, окно и evaluation
   delay. Для multialert открыть конкретный subalert.
2. На dashboard проверить соседние signals той же функции: errors, throttles,
   queue, inflight, memory и duration.
3. Открыть raw logs на alert window с запасом на delay. Сначала выбрать
   component, затем сузить по `event`, `request_id`, `level` или `error_code`.
4. Для log-derived alert сверить source selector/grouping и выходную series.
   Поставка log aggregates может занимать до трёх минут.
5. Для direct gauges сопоставить heartbeat/backlog с `retry_worker_completed` и
   log-derived heartbeat; для managed metrics искать подтверждение на соседних
   platform-графиках.
6. После восстановления проверить переход `OK` и доставку в Telegram и email.

Empty event graph при зелёном alert — нормальное состояние. Порог не ослабляется
по одному шумному срабатыванию: сначала проверяются raw logs, series, окно и
delay, затем desired state, тесты и live drift.

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
