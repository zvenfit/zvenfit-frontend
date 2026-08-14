# Technical site traffic

Эта схема даёт дешёвую техническую оценку посещаемости внутри Yandex Cloud. Она
не заменяет маркетинговые счётчики и не обещает точное распознавание человека:
User-Agent и `webdriver` можно подделать.

## Поток данных

```text
HTML page
  → traffic-beacon.js
  → POST site-traffic Cloud Function
  → structured site_page_view in Cloud Logging
  → zvenfit_site_page_views_5m log metric
  → Monium dashboard
```

Один запуск beacon соответствует одному page view. CDN-запросы, status, cache,
bytes и latency берутся из встроенных `edge.*` метрик и не дублируются функцией.

## Как трактовать traffic_class

| Класс          | Интерпретация                                                                 |
| -------------- | ----------------------------------------------------------------------------- |
| `browser_like` | User-Agent похож на обычный браузер, явных признаков автоматизации нет        |
| `known_bot`    | User-Agent содержит известный bot/crawler/spider signature                    |
| `synthetic`    | Наш smoke monitor, headless/autotest signature или `navigator.webdriver=true` |
| `unknown`      | curl, нестандартный клиент или недостаточно данных                            |

Beacon видит только клиентов, которые исполнили JavaScript. Поэтому большинство
простых crawler-ов останется только в `edge.requests`, а `known_bot` отражает
лишь JS-capable bots с узнаваемым User-Agent. Разницу между `edge.requests` и
beacon events нельзя трактовать как bots: edge также считает CSS, JS, изображения
и клиентов с блокировщиком.

Для примерной посещаемости смотри `browser_like`. Не называй его числом
уникальных людей: один пользователь создаёт несколько page views, блокировщик
или ошибка сети может скрыть beacon, а бот может маскироваться браузером.

## Что хранится

Каждый `site_page_view` содержит:

- `traffic_class`, `host`, нормализованный `page`;
- полный `url` вместе с query и полный `referrer`;
- IP и полный User-Agent;
- случайный `page_view_id`, `webdriver` и function `request_id`.

Retention общей Cloud Logging group — 3 дня. В labels метрики разрешены только
`traffic_class` и `host`, то есть не больше 12 штатных рядов. `page` тоже
остаётся только в логах: произвольные 404 URL сделали бы его высококардинальной
label. IP, URL, referrer, User-Agent и IDs тем более нельзя добавлять в grouping.

Beacon не подключается к `404.html`, поэтому сканирование произвольных URL и
опечатки не становятся page views. Referrer сохраняется полностью для HTTP(S);
невалидные и app-specific схемы очищаются до пустой строки и не приводят к
потере самого page view.

Persistent state отсутствует. Нет cookies, sessionization, HMAC, Lockbox, YDB,
Object Storage и отдельного lifecycle. Повторный `page_view_id` можно увидеть
при ручном расследовании, но функция намеренно не делает дедупликацию.

## Log-based metric Monium

Создай в Monium одну метрику по desired state из
`scripts/monitoring.config.json`:

- ID: `zvenfit_site_page_views_5m`;
- source: production logs с `meta.application="zvenfit-frontend"`,
  `meta.environment="production"`, `meta.service="zvenfit-site-traffic"`;
- filter/event: `meta.event="site_page_view"`;
- aggregation: count, window 5 minutes;
- grouping: `meta.traffic_class`, `host` (в Monium `host` — системное поле, не `meta.host`).

На dashboard добавь:

1. stacked bars page views по `traffic_class`;
2. долю `known_bot` и `synthetic`;
3. плитку **Последний page view** с запросом
   `series_sum({..., name="zvenfit_site_page_views_5m"})` и агрегацией `last`;
4. при ручном разборе — top `meta.page` непосредственно в трёхдневных логах,
   не как metric label;
5. рядом встроенные `edge.requests`, `edge.requests_status`,
   `edge.requests_cache_status`, `edge.bytes_sent` и
   `edge.request_time_seconds` для CDN resource `bc8rubabuwzpqqp7rifz`.
6. в общий диагностический график `functions_errors` добавь
   `resource_id="zvenfit-site-traffic"`, но не создавай для аналитики paging-alert.

Старые виджеты **Трафик: запросы по классам** и
**Трафик: технические сессии людей** относятся к удалённой stateful-схеме
и должны быть удалены с dashboard.

Freshness-card не является paging-alert: задержка или потеря технической
аналитики не должна попадать в критичный lead alert.

Пользовательский dashboard Monium не поддерживает raw-log widget. Поэтому плитка
показывает последнее значение объединённого пятиминутного bucket, а не точный
timestamp строки лога. Для точного времени последнего `site_page_view` используй
Cloud Logging с тем же event selector. Добавлять ради этого отдельную timestamp-
метрику или application state не нужно.

## Стоимость и ограничения

При масштабе ZvenFit вызовы функции и объём трёхдневных логов должны помещаться
в общие free tiers billing account. Log-derived metric с тремя ограниченными
labels стоит пренебрежимо мало. Проверяй фактическое потребление в billing:
free tiers разделяются с другими ресурсами аккаунта.

Платный CDN log export, Query и DataLens этой схеме не нужны.
