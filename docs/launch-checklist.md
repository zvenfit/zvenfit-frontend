# Production release checklist

Короткий повторяемый runbook для production-релизов ZvenFit. Первичная настройка Yandex Cloud, YDB, Telegram и GitHub Secrets вынесена в [`setup.md`](setup.md); мониторинг — в [`monitoring.md`](monitoring.md).

## Текущее состояние

На 2026-08-13 в коде и локальной проектной документации зафиксированы:

- durable lead pipeline: YDB является источником истины, Telegram доставляется асинхронно;
- retry timer, идемпотентность заявок и серверный rate limit;
- production functions для lead intake и Fitbase schedule;
- CI-проверки, миграции YDB, сборка сайта и deploy в Object Storage;
- production monitoring dashboard, alert-конфигурация и synthetic test без персональных данных.

Старый план запуска ветки `feature/durable-leads-ydb` удалён: функциональность уже находится в `main`. Импорт старых Telegram-заявок и первоначальная ротация секретов — одноразовые исторические операции; повторять их при обычном релизе не нужно.

## Перед merge

```bash
npm run lint:public
npm run test:lead-fn
npm run test:schedule-fn
npm run test:monitoring
npm run test:lead-import
npm run test:build
```

- [ ] Все проверки завершились успешно.
- [ ] В diff нет секретов, персональных данных, реальных `.env*` и содержимого `knowledge-base/`.
- [ ] Для изменений CSS/JS используется новый `ASSET_VERSION` — workflow по умолчанию берёт номер запуска.

## После deploy

1. Дождись успешного завершения workflow **Deploy to Production**.
2. Запусти read-only smoke-test:

   ```bash
   npm run smoke:production
   ```

   Он проверяет обе страницы, подставленные API URL, CORS lead API через
   `OPTIONS` и схему `{ ok: true, items: [...] }` schedule API. Запрос `POST` в
   production не выполняется, запись в YDB не создаётся, Telegram не вызывается.

3. Открой production dashboard из [`monitoring.md`](monitoring.md) и проверь:

   - retry worker heartbeat поступает;
   - очередь Telegram не растёт и не содержит старых `pending`/`sending`;
   - runtime, YDB, Fitbase и rate-limit health alerts находятся в `OK`;
   - после deploy нет нового всплеска ошибок.

- [ ] Workflow завершился успешно.
- [ ] `npm run smoke:production` завершился успешно.
- [ ] Dashboard остаётся зелёным минимум десять минут после deploy.

## Когда нужен реальный тестовый лид

Отправляй явно помеченную тестовую заявку только если менялись payload формы, lead handler, YDB persistence, Telegram delivery или retry timer. После проверки удали её из рабочих процессов менеджеров.

Проверка считается успешной, когда заявка:

- появилась в YDB;
- получила `telegram_status = sent` (временный `pending` допустим до срабатывания timer);
- пришла в рабочий Telegram-чат ровно один раз.

## Операции не для каждого релиза

- Импорт исторических заявок: [`setup.md`](setup.md#импорт-старых-заявок-из-telegram).
- Ротация токенов и ключей: [`setup.md`](setup.md#ротация-секретов).
- Проверка Telegram/email notification channels синтетическими событиями: [`monitoring.md`](monitoring.md#проверка-доставки-алертов).
- SmartCaptcha: подключать только если honeypot и rate limit перестанут сдерживать реальный спам.
