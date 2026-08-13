# Staging environment

Статус: deployment-контракт подготовлен, cloud bootstrap ещё не выполнен.

Staging разворачивает тот же commit и те же deploy-скрипты, что production, но
использует отдельный GitHub Environment и отдельный Yandex Cloud folder.
Workflow запускается только вручную через **Deploy to Staging**.

## Зафиксированная карта ресурсов

| Ресурс            | Staging                               | Production                    |
| ----------------- | ------------------------------------- | ----------------------------- |
| Site              | `https://staging.zvenfit.ru`          | `https://zvenfit.ru`          |
| Bucket            | `zvenfit-frontend-staging`            | `zvenfit-frontend`            |
| Lead Function     | `zvenfit-telegram-lead-staging`       | `zvenfit-telegram-lead`       |
| Schedule Function | `zvenfit-fitbase-schedule-staging`    | `zvenfit-fitbase-schedule`    |
| Schedule provider | `fixture`                             | `fitbase`                     |
| Retry trigger     | `zvenfit-lead-telegram-retry-staging` | `zvenfit-lead-telegram-retry` |
| YDB               | `zvenfit-leads-staging`               | `zvenfit-leads`               |
| Allowed origins   | `https://staging.zvenfit.ru`          | production domains            |

`scripts/validate-deployment-config.cjs` проверяет эту карту до установки `yc`
и до чтения cloud credentials. Случайная подстановка production resource name в
staging завершает workflow ошибкой.

## GitHub Environment `staging`

Создай отдельный environment `staging` со следующими secrets:

| Secret                   | Требование                                      |
| ------------------------ | ----------------------------------------------- |
| `YC_FOLDER_ID`           | ID только staging folder                        |
| `YC_SA_JSON_KEY`         | Ключ staging deploy SA                          |
| `TELEGRAM_BOT_TOKEN`     | Отдельный staging bot                           |
| `TELEGRAM_CHAT_ID`       | Отдельный test chat                             |
| `LEAD_RATE_LIMIT_SECRET` | Новое случайное значение, не production secret  |
| `MONIUM_API_KEY`         | Ключ с доступом только к staging Monium project |
| `YC_ACCESS_KEY_ID`       | Статический ключ только staging bucket          |
| `YC_SECRET_ACCESS_KEY`   | Пара staging access key                         |

`FITBASE_API_TOKEN` в staging не нужен и не должен копироваться из production:
workflow фиксирует `SCHEDULE_PROVIDER=fixture`, а deploy-скрипт не передаёт
Fitbase credentials в окружение fixture-функции.

Обязательная environment variable:

| Variable                     | Требование                                          |
| ---------------------------- | --------------------------------------------------- |
| `YC_LEAD_SERVICE_ACCOUNT_ID` | Runtime SA только staging Lead Function/YDB/trigger |

Остальные variables повторяют production names (`YDB_LEADS_TABLE`,
`YDB_RATE_LIMITS_TABLE`, timeouts и limits), но применяются внутри отдельной YDB.

## Cloud bootstrap

Под административной identity в отдельном staging folder нужно один раз создать:

1. Serverless YDB `zvenfit-leads-staging` с deletion protection.
2. Runtime SA lead function с `ydb.editor` только на staging YDB.
3. Deploy SA с `functions.editor` и resource-scoped YDB/S3 permissions только в
   staging folder.
4. Обе Cloud Functions и public `functionInvoker` bindings.
5. Bucket `zvenfit-frontend-staging`, static hosting, domain и TLS certificate.
6. Staging Monium project/dashboard selectors с `environment=staging`.

Обычный deploy не выдаёт public IAM binding и не создаёт YDB. Это сохраняет
текущую production-границу: широкие bootstrap-права не попадают в CI.

## Расписание без production Fitbase

Staging schedule-функция использует динамический `fixture`: даты считаются от
параметра `from`, поэтому набор не устаревает с календарём. В него входят
обычное и пересекающееся занятия, детская тренировка, отмена, закрытая запись,
перенос и карточка без необязательных данных. Все названия и тренеры явно
синтетические; production ответы и персональные данные не копируются.

Защита состоит из трёх независимых уровней:

1. deployment validator требует `fitbase` для production и `fixture` для staging;
2. deploy-скрипт отклоняет fixture при production environment до запуска `yc`;
3. сама Cloud Function отклоняет fixture, если runtime environment — production.

Неизвестный provider всегда считается ошибкой: автоматического fallback в
облачных окружениях нет.

## Первый безопасный запуск

Перед **Deploy to Staging**:

- все перечисленные ресурсы существуют;
- GitHub Environment содержит только staging credentials;
- `staging.zvenfit.ru` указывает на staging bucket;
- Telegram bot/chat не используются менеджерами;
- staging wrapper содержит `schedule_provider: fixture`;
- production workflow и secrets не изменялись.

После deploy запускается read-only smoke с `--site https://staging.zvenfit.ru`.
Полный lead POST появится отдельным этапом в локальном Playwright-проекте и
будет писать только синтетические данные в staging YDB.
