# Staging environment

Статус: deployment-контракт подготовлен, cloud bootstrap ещё не выполнен.

Staging разворачивает тот же commit и те же бизнес-функции, что production, но
использует отдельный GitHub Environment и отдельный Yandex Cloud folder.
Workflow запускается только вручную через **Deploy to Staging**. Bucket и
функции staging не публикуются напрямую: единственная внешняя точка входа —
API Gateway с HTTP Basic authorizer.

## Зафиксированная карта ресурсов

| Ресурс            | Staging                               | Production                    |
| ----------------- | ------------------------------------- | ----------------------------- |
| Site              | `https://staging.zvenfit.ru`          | `https://zvenfit.ru`          |
| Bucket            | `zvenfit-frontend-staging`            | `zvenfit-frontend`            |
| API Gateway       | `zvenfit-staging`                     | не используется               |
| Authorizer        | `zvenfit-staging-authorizer`          | не используется               |
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

| Secret                        | Требование                                        |
| ----------------------------- | ------------------------------------------------- |
| `YC_FOLDER_ID`                | ID только staging folder                          |
| `YC_SA_JSON_KEY`              | Ключ staging deploy SA                            |
| `TELEGRAM_BOT_TOKEN`          | Отдельный staging bot                             |
| `TELEGRAM_CHAT_ID`            | Отдельный test chat                               |
| `LEAD_RATE_LIMIT_SECRET`      | Новое случайное значение, не production secret    |
| `MONIUM_API_KEY`              | Ключ с доступом только к staging Monium project   |
| `YC_ACCESS_KEY_ID`            | Статический ключ только staging bucket            |
| `YC_SECRET_ACCESS_KEY`        | Пара staging access key                           |
| `STAGING_BASIC_AUTH_USERNAME` | Printable ASCII без пробелов и `:`                |
| `STAGING_BASIC_AUTH_PASSWORD` | Не менее 32 printable ASCII символов без пробелов |

`FITBASE_API_TOKEN` в staging не нужен и не должен копироваться из production:
workflow фиксирует `SCHEDULE_PROVIDER=fixture`, а deploy-скрипт не передаёт
Fitbase credentials в окружение fixture-функции.

Обязательная environment variable:

| Variable                        | Требование                                          |
| ------------------------------- | --------------------------------------------------- |
| `YC_LEAD_SERVICE_ACCOUNT_ID`    | Runtime SA только staging Lead Function/YDB/trigger |
| `YC_GATEWAY_SERVICE_ACCOUNT_ID` | SA Gateway для чтения bucket и вызова функций       |

Остальные variables повторяют production names (`YDB_LEADS_TABLE`,
`YDB_RATE_LIMITS_TABLE`, timeouts и limits), но применяются внутри отдельной YDB.

## Cloud bootstrap

Под административной identity в отдельном staging folder нужно один раз создать:

1. Serverless YDB `zvenfit-leads-staging` с deletion protection.
2. Runtime SA lead function с `ydb.editor` только на staging YDB.
3. Gateway SA с `storage.viewer` на staging bucket и
   `functions.functionInvoker` на lead, schedule и authorizer functions. Lead
   Runtime SA также получает `functions.functionInvoker` только на lead-функцию,
   чтобы retry-trigger мог обработать очередь.
4. Deploy SA с `functions.editor`, `api-gateway.editor` и resource-scoped
   YDB/S3 permissions только в staging folder.
5. Три приватные Cloud Functions без binding `allUsers`:
   `zvenfit-telegram-lead-staging`, `zvenfit-fitbase-schedule-staging` и
   `zvenfit-staging-authorizer`.
6. Приватный bucket `zvenfit-frontend-staging`: anonymous read/list/config
   выключены, static website hosting выключен.
7. API Gateway `zvenfit-staging`, сертификат `staging.zvenfit.ru` и DNS CNAME на
   default gateway domain.
8. Staging Monium project/dashboard selectors с `environment=staging`.

Обычный deploy не меняет IAM, не создаёт YDB и не прикрепляет custom domain.
Он только проверяет заранее выданные private bindings, обновляет версии функций
и спецификацию существующего Gateway. Широкие bootstrap-права в CI не попадают.

## Граница доступа

`staging.zvenfit.ru` разрешается публичным DNS, однако любая HTML-страница,
статика и `/api/*` требуют HTTP Basic. Authorizer хранит только SHA-256 от
`username:password`; исходные credentials существуют только в GitHub
Environment и у разработчиков в password manager. Для совместимости с HTTP
Basic логин не содержит `:`, а обе части ограничены printable ASCII. Пароль
генерируется криптографически случайным и не переиспользуется ни в production,
ни в других сервисах.

Gateway читает приватный bucket и вызывает приватные функции от собственного
service account. Прямой URL bucket возвращает `403`, прямые URLs функций не
принимают anonymous invoke. CORS и `robots.txt` не считаются авторизацией.

Staging-сборка дополнительно:

- не содержит production analytics;
- добавляет `noindex, nofollow` во все HTML;
- публикует `robots.txt` с `Disallow: /`;
- использует same-origin endpoints `/api/lead` и `/api/schedule`.

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
- `staging.zvenfit.ru` указывает только на API Gateway;
- bucket приватный и static website hosting выключен;
- функции не содержат `allUsers`: Gateway SA имеет точечные invoker bindings,
  а Lead Runtime SA — дополнительный binding только на lead-функцию;
- authorizer credentials заданы только в staging Environment;
- Telegram bot/chat не используются менеджерами;
- staging wrapper содержит `schedule_provider: fixture`;
- production workflow и secrets не изменялись.

После deploy read-only smoke сначала проверяет, что анонимный запрос получает
`401` с HTTP Basic challenge, затем проходит те же страницы и API с корректными
credentials. Секреты передаются через env и не печатаются в лог.
Полный lead POST появится отдельным этапом в локальном Playwright-проекте и
будет писать только синтетические данные в staging YDB.
