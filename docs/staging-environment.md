# Staging environment

Staging разворачивает тот же commit, что production, но физически отделён от
него: отдельные Yandex Cloud folder, bucket, Functions, YDB, service accounts и
GitHub Environment. Workflow запускается вручную из `main` через **Deploy to
Staging**.

Единственная внешняя точка входа — API Gateway. Он защищает HTML, assets и оба
`/api/*` одним HTTP Basic authorizer и Smart Web Security. Bucket и Functions
остаются приватными и напрямую из интернета недоступны.

## Карта окружений

| Ресурс | Staging | Production |
| --- | --- | --- |
| Site | `https://staging.zvenfit.ru` | `https://zvenfit.ru` |
| Folder | `zvenfit-staging` | production folder |
| Bucket | `zvenfit-frontend-staging` | `zvenfit-frontend` |
| API Gateway | `zvenfit-staging` | не используется |
| SWS / ARL | API protection + 120 req/min/IP | отдельно от staging |
| Authorizer | `zvenfit-staging-authorizer` | не используется |
| Lead Function | `zvenfit-telegram-lead-staging` | `zvenfit-telegram-lead` |
| Notification mode | `fixture` без внешних вызовов | `telegram` |
| Schedule Function | `zvenfit-fitbase-schedule-staging` | `zvenfit-fitbase-schedule` |
| Schedule provider | `fixture` | `fitbase` |
| Retry trigger | bootstrap-only | bootstrap-only |
| YDB | `zvenfit-leads-staging` | `zvenfit-leads` |
| Allowed origins | только `https://staging.zvenfit.ru` | production domains |

`scripts/validate-deployment-config.cjs` проверяет эту карту до cloud-команд.
Staging не может получить production resource name, Fitbase или Telegram mode.

## Аутентификация CI

Постоянных JSON-ключей и S3 access keys в новом контуре нет.

1. GitHub выдаёт job OIDC JWT с audience `https://github.com/zvenfit`.
2. Отдельная Workload Identity Federation принимает только subject
   `repo:zvenfit/zvenfit-frontend:environment:staging`.
3. JWT обменивается на короткоживущий IAM token staging deploy SA.
4. Для загрузки bucket CI выпускает ephemeral access key сроком на один час и
   ограничивает session policy конкретным staging bucket.
5. Ephemeral key наследует только доступ deploy SA к staging bucket.

Production использует отдельные federation, subject и deploy SA. Staging
wrapper не содержит `secrets: inherit`; production secrets передаются в
reusable workflow явным allowlist только из production wrapper.

Исполняемый файл YC CLI закреплён версией и SHA-256. GitHub Actions закреплены
commit SHA; `curl | bash` и плавающие Docker tags не используются.

## GitHub Environment `staging`

Secrets:

| Secret | Назначение |
| --- | --- |
| `STAGING_BASIC_AUTH_USERNAME` | логин без пробелов и `:` |
| `STAGING_BASIC_AUTH_PASSWORD` | случайный пароль длиной не менее 32 символов |
| `LEAD_RATE_LIMIT_SECRET` | отдельный HMAC secret для staging rate limiter |

В staging отсутствуют `FITBASE_API_TOKEN`, production Telegram credentials,
Monium key и любые постоянные Yandex Cloud keys.

Variables:

| Variable | Назначение |
| --- | --- |
| `YC_FOLDER_ID` | staging folder |
| `YC_DEPLOY_SERVICE_ACCOUNT_ID` | SA, связанный только со staging WIF |
| `YC_LEAD_SERVICE_ACCOUNT_ID` | runtime SA lead function |
| `YC_GATEWAY_SERVICE_ACCOUNT_ID` | runtime SA API Gateway |
| `YC_SWS_SECURITY_PROFILE_ID` | SWS profile с подключённым ARL |
| `Y_MAPS_API_KEY` | browser key для staging build |

Environment должен разрешать deployment только из `main` и требовать
подтверждение независимого reviewer с запрещённым self-review. Код PR не
получает staging secrets.

## Минимальная IAM-матрица

Bootstrap выполняется административной identity один раз. Обычный CI не создаёт
ресурсы, не меняет IAM и не управляет retry trigger.

| Subject | Resource | Role / действие |
| --- | --- | --- |
| Deploy SA | сам Deploy SA | выпуск ephemeral access key |
| Deploy SA | три staging Functions | создание версий и чтение метаданных |
| Deploy SA | Lead runtime SA, Gateway SA | `iam.serviceAccounts.user` |
| Deploy SA | staging YDB | миграции схемы и integration probe |
| Deploy SA | staging bucket | sync/delete objects, чтение ACL/policy |
| Deploy SA | staging API Gateway | обновление spec |
| Gateway SA | staging bucket | read objects |
| Gateway SA | три staging Functions | `functions.functionInvoker` |
| Lead runtime SA | staging YDB | read/write leads и rate limits |
| Lead runtime SA | lead Function | timer invocation |

Folder/cloud bindings дополнительно проверяются административным
`scripts/audit-staging-public-access.sh`. Он отклоняет публичные sensitive roles
для `allUsers` и `allAuthenticatedUsers`. CI независимо выполняет эффективные
anonymous probes прямых URL bucket/Functions.

## Безопасный deployment

Порядок staging deploy fail-closed:

1. Проверить статическую карту окружения и прогнать все тесты.
2. Получить IAM token через WIF и ephemeral S3 session.
3. До загрузки проверить bucket flags, website hosting, ACL, policy и anonymous
   GET. При любой публичности deployment останавливается.
4. Собрать staging без GTM, Метрики/VK analytics, с `noindex, nofollow` и
   `robots.txt: Disallow /`.
5. Загрузить каждый объект с private ACL, затем повторно проверить object ACL и
   anonymous GET.
6. Создать candidate-версию authorizer, напрямую проверить правильный и
   неправильный Basic Auth, после чего переключить стабильный tag
   `staging-live`.
7. Обновить Gateway spec. Он ссылается только на `staging-live`, а не на
   изменяемый `$latest`, и подключает SWS profile.
8. Выполнить smoke. При ошибке вернуть tag authorizer на предыдущую версию.

Lead и schedule integrations также используют tag `staging-live`.

## Заявки и внешние side effects

Staging lead flow пишет только в staging YDB. `TELEGRAM_DELIVERY_MODE=fixture`
считает уведомление доставленным без HTTP-запроса к Telegram; production bot и
chat ID в окружении отсутствуют.

Lead endpoint принимает только `POST application/json` с Origin из allowlist.
Отсутствующий/чужой Origin возвращает `403`, другой media type — `415`. Это
защищает endpoint от CSRF даже если Basic credentials оказались в browser cache.

Smoke выполняет `POST {}` в same-origin `/api/lead` и требует контролируемый
`400`. Payload не проходит валидацию, поэтому запись в YDB и уведомление не
создаются. Schedule smoke требует ровно совместимую форму ответа:
`{ "ok": true, "items": [...] }`.

Полный Playwright E2E позже отправляет явно синтетическую валидную заявку в
staging YDB и проверяет её через отдельный read-only test probe. Production
smoke остаётся только GET/OPTIONS и никогда не создаёт лид.

## DNS и TLS

`staging.zvenfit.ru` должен указывать только на default domain staging Gateway.
Managed certificate выпускается для этого hostname; DNS validation и CNAME
создаются у текущего DNS provider. До активации сертификата и custom domain
Gateway остаётся в deny-all bootstrap spec и не публикует staging content.

## Release gate

Staging считается готовым, когда одновременно выполнены условия:

- environment защищён `main` + independent approval;
- WIF subject и deploy SA отличаются от production;
- административный parent-IAM audit зелёный;
- прямые bucket/function URLs отвергают anonymous access;
- неверный и отсутствующий Basic Auth дают `401`;
- SWS и ARL подключены к Gateway;
- smoke проверяет страницы, runtime configs, безопасный lead validation probe и
  рабочую схему schedule;
- никакой staging путь не вызывает Fitbase или Telegram.
