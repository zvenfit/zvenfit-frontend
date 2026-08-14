# Техническая посещаемость Cloud CDN

Эта аналитика предназначена для владельцев продукта и инфраструктуры. Она не
заменяет Яндекс Метрику: здесь считаются технические запросы и page views по
сырым CDN-логам, а маркетинговые конверсии остаются в маркетинговых системах.

## Поток данных

```text
Cloud CDN raw logs → private Object Storage (30 дней) → Yandex Query → DataLens
```

Cloud Function, Object Storage trigger, Lockbox и session state не нужны.
Sessions пока не считаются. Статусы, cache, bytes и latency берутся из готовых
метрик Cloud CDN `edge.*` в Monitoring, без дублирующих custom metrics.

## Raw logs

Одноразово создать или проверить приватный бакет, 30-дневный lifecycle и экспорт:

```bash
YC_FOLDER_ID=b1ge1e4iopttj79hfdfm npm run provision:cdn-raw-logs
```

Скрипт не создаёт service account, функцию, trigger или secret. Экспорт идёт в
`zvenfit-cdn-access-logs/raw/zvenfit/cdn`. Не добавляй запрещающую bucket policy:
Cloud CDN должен иметь возможность писать объекты; anonymous read/list при этом
оставляются выключенными.

## Binding Yandex Query

Создай Object Storage connection к приватному бакету и binding:

Для private connection выбери service account с bucket-level ролью
`storage.viewer`; статический ключ и Lockbox для этого не нужны. Можно
использовать существующий подходящий account или создать отдельный read-only.

- имя: `zvenfit-cdn-raw-logs`;
- путь: `raw/zvenfit/cdn/`;
- формат: `json_each_row`;
- compression: `gzip`;
- схема:

Все колонки схемы пометь как required: в формате CDN они присутствуют всегда,
а строковые поля без значения приходят пустыми строками.

| Column | YQL type |
| --- | --- |
| `resource_id` | `String` |
| `timestamp_ms` | `String` |
| `bytes_sent` | `Int64` |
| `request_uri` | `String` |
| `status` | `String` |
| `user_agent` | `String` |
| `request_id` | `String` |
| `remote_addr` | `String` |
| `upstream_addr` | `String` |
| `request_time` | `Double` |
| `upstream_cache_status` | `String` |
| `http_host` | `String` |
| `upstream_response_time` | `String` |

Перед сохранением обязательно проверь binding через Preview. Production-объект
проверен 14 августа 2026 года: `.log.gz`, внутри `json_each_row` со всеми
перечисленными полями.

## Dataset DataLens

Создай подключение DataLens к Yandex Query с доступом SQL на чтение и используй
как Raw SQL содержимое [`../analytics/cdn-traffic.yql`](../analytics/cdn-traffic.yql).
Запрос не выдаёт в dataset IP, User-Agent или raw URL. Он классифицирует каждую
запись в один из четырёх взаимоисключающих классов:

- `browser_like` — есть положительные признаки обычного браузера и нет признаков
  известного бота или automation client;
- `known_bot` — известный crawler, search/social preview bot;
- `synthetic` — наши проверки с User-Agent `ZvenFit-Synthetic-Monitor/1.0`;
- `unknown` — scanner paths, headless/curl/Playwright и всё, что нельзя уверенно
  назвать браузером.

Классификация эвристическая: замаскированный робот может выглядеть как браузер.
Поэтому спорные записи сохраняются как `unknown`, а не отбрасываются.

Dataset отдаёт две аддитивные меры:

- `requests` — одна единица на CDN-запрос;
- `page_views` — одна единица только для ответа `2xx` или `304` по site host,
  если URI не похож на asset, API, robots или sitemap.

Sessions намеренно отсутствуют.

## Карточки DataLens

Минимальный dashboard:

| Карточка | Настройка |
| --- | --- |
| Последний полученный лог | Indicator, `MAX(log_timestamp)` |
| Requests | `SUM(requests)`, цвет/серия по `traffic_class` |
| Page views | `SUM(page_views)`, фильтр/серия по `traffic_class` |

Для `Последний полученный лог` не создавай paging-alert. Это контроль свежести
для ручной проверки два-три раза в день; задержка raw-log export допустима.

Для эксплуатационных status/cache/bytes/latency используй в Monitoring:

```text
edge.requests{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.requests_status{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.requests_cache_status{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.bytes_sent{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
edge.request_time_seconds{service="yccdn", resource="bc8rubabuwzpqqp7rifz"}
```

## Проверка

```bash
npm run test:cdn-traffic
npm run test:monitoring
```
