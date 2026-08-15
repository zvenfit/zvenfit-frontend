# Setup: ZvenFit frontend and serverless backends

## Runtime architecture

```text
production browser -> public production Functions -> production YDB -> Telegram

staging browser -> Basic Auth + SWS API Gateway
                -> private staging Functions -> staging YDB -> staging sink
                -> private staging Object Storage
```

Production и staging используют разные folders, databases, buckets, Functions,
runtime/deploy service accounts и Workload Identity Federations.

У каждой backend-функции отдельные production и staging composition roots и
сборки. Production build физически не содержит staging fixtures, staging build
не содержит Telegram/Fitbase adapters. Выбор делается deploy-скриптом по
`DEPLOYMENT_ENVIRONMENT`, а не переключателем внутри runtime.

## Local development

```bash
cp .env.example .env.development
npm ci
npm ci --prefix functions/lead-intake
npm ci --prefix functions/fitbase-schedule
npm ci --prefix functions/staging-authorizer
npm run dev:watch
```

Сайт доступен на `http://localhost:4173`, локальный API — на
`http://localhost:3000`. В git не попадают реальные `.env*`, credentials,
browser state, traces и test artifacts.

## Yandex Cloud CLI

Для административного bootstrap установи YC CLI по официальной инструкции и
проверь скачанный файл до запуска. CI не исполняет install script: он скачивает
закреплённый бинарник и сверяет SHA-256 в `scripts/install-yc-cli.sh`.

Локальная административная сессия:

```bash
yc init
yc config get cloud-id
yc config get folder-id
```

Не создавай authorized JSON key для GitHub Actions. Deployment использует WIF.
Production deploy identity называется `zvenfit-frontend-ci-sa`: application
namespace в имени обязателен, потому что folder также содержит Estetika и
reminder. GitHub хранит только неизменяемый service account ID.

## GitHub OIDC / WIF

Для каждого environment создаётся отдельная federation:

```bash
yc iam workload-identity oidc federation create \
  --name <environment-federation> \
  --folder-id <environment-folder-id> \
  --issuer https://token.actions.githubusercontent.com \
  --audiences https://github.com/zvenfit \
  --jwks-url https://token.actions.githubusercontent.com/.well-known/jwks
```

Federated credential привязывает ровно один GitHub Environment к его deploy SA:

```bash
yc iam workload-identity federated-credential create \
  --service-account-id <environment-deploy-sa-id> \
  --federation-id <environment-federation-id> \
  --external-subject-id \
  'repo:zvenfit/zvenfit-frontend:environment:<production-or-staging>'
```

Job получает OIDC JWT, обменивает его на короткоживущий IAM token и выпускает
одночасовой ephemeral Object Storage key с session policy только для bucket
выбранного environment. Постоянные `YC_SA_JSON_KEY`,
`YC_ACCESS_KEY_ID` и `YC_SECRET_ACCESS_KEY` workflow не читает. После перехода
на WIF эти GitHub Secrets и соответствующие authorized/access keys должны быть
отозваны, а не оставлены как запасной путь.

## GitHub Environments

Общие правила:

- production и staging variables/secrets хранятся раздельно;
- deployment разрешён только из `main`;
- staging требует независимого approval, self-review запрещён;
- staging workflow не наследует repository secrets;
- `pull_request_target` с checkout кода PR не используется.

Environment variables:

| Variable | Production | Staging |
| --- | --- | --- |
| `YC_FOLDER_ID` | production folder | staging folder |
| `YC_DEPLOY_SERVICE_ACCOUNT_ID` | production deploy SA | staging deploy SA |
| `YC_LEAD_SERVICE_ACCOUNT_ID` | production runtime SA | staging runtime SA |
| `YC_GATEWAY_SERVICE_ACCOUNT_ID` | — | staging Gateway SA |
| `YC_SWS_SECURITY_PROFILE_ID` | — | staging SWS profile |
| `Y_MAPS_API_KEY` | browser maps key | browser maps key |

Production secrets:

- `TELEGRAM_BOT_TOKEN`;
- `TELEGRAM_CHAT_ID`;
- `LEAD_RATE_LIMIT_SECRET`;
- `MONIUM_API_KEY`;
- `FITBASE_API_TOKEN`.

Staging secrets:

- `STAGING_BASIC_AUTH_USERNAME`;
- `STAGING_BASIC_AUTH_PASSWORD`;
- отдельный `LEAD_RATE_LIMIT_SECRET`.

Staging не получает Fitbase, Telegram, Monium или production credentials.

## Infrastructure bootstrap

До первого CI deploy администратор создаёт ресурсы и выдаёт роли по таблице из
[`staging-environment.md`](staging-environment.md#минимальная-iam-матрица).

Важные границы:

- deploy SA может менять версии только своих Functions и spec своего Gateway;
- в общей production folder роли `functions.editor` и `ydb.editor` назначаются
  на конкретные ресурсы, а не на folder целиком;
- runtime lead SA имеет доступ только к своей YDB;
- Gateway SA только читает свой bucket и вызывает свои Functions;
- retry trigger создаётся/обновляется bootstrap-процессом, не обычным CI;
- CI не создаёт YDB, Functions, Gateway, SWS, DNS или IAM bindings.

Для production публичный `functions.functionInvoker` назначается один раз
администратором. Для staging публичных bindings быть не должно.

## Deployment

Production запускается push в `main`; staging — только вручную.

Порядок reusable workflow:

1. Проверка точной resource map и полный test suite.
2. OIDC authentication.
3. YDB integration probe и миграции.
4. Новые версии lead/schedule Functions.
5. Для staging: candidate authorizer, allow/deny probes, stable tag switch.
6. Build статического сайта.
7. Private-storage preflight, upload с private ACL, postflight.
8. Gateway update и non-persisting smoke.
9. Rollback authorizer tag, если staging site/smoke завершился ошибкой.

Staging build удаляет исходный GTM и production analytics, добавляет
`noindex, nofollow`, закрывающий `robots.txt` и same-origin `/api/*`.

## Local function deployment

Локальный production-like deploy требует явных runtime credentials:

```bash
export YC_FOLDER_ID=<folder-id>
export YC_LEAD_SERVICE_ACCOUNT_ID=<runtime-sa-id>
export DEPLOYMENT_ENVIRONMENT=production
export FUNCTION_INVOKER_MODE=public
export TELEGRAM_BOT_TOKEN=<secret>
export TELEGRAM_CHAT_ID=<secret>
export LEAD_RATE_LIMIT_SECRET="$(openssl rand -hex 32)"

npm run deploy:lead-fn
```

Не печатай значения secrets и не сохраняй их в отслеживаемые файлы.

## CORS and request boundary

Origin задаётся wrapper input `allowed_origins`. Lead API принимает только:

- `POST`;
- `Content-Type: application/json`;
- непустой Origin из allowlist.

`OPTIONS` с неизвестным Origin и POST без Origin отклоняются. После изменения
доменов одновременно обнови wrapper map, `ALLOWED_ORIGINS` и тесты deployment
config.

## Verification

```bash
npm run lint
npm run lint:public
npm run test:lead-fn
npm run test:schedule-fn
npm run test:staging-authorizer
npm run test:lead-import
npm run test:monitoring
npm run test:build
npm run test:build:staging
```

Production smoke:

```bash
npm run smoke:production
```

Он выполняет только GET/OPTIONS. Staging smoke дополнительно делает
неперсистящий `POST {}` и требует validation error `400`.

## Troubleshooting

### OIDC token exchange fails

Проверь audience, issuer/JWKS и точный subject. Для environment subject имеет
вид `repo:zvenfit/zvenfit-frontend:environment:<name>`.

### Ephemeral S3 key is denied

Deploy SA должен иметь право выпустить ephemeral key для себя и доступ только к
целевому bucket. У AWS CLI должны быть одновременно access key, secret и session
token.

### Staging upload stops before sync

Это fail-closed поведение. Проверь anonymous flags, website hosting, bucket ACL,
bucket policy и результат прямого anonymous GET. Не отключай preflight.

### Lead form returns `403` or `415`

Проверь browser Origin и `Content-Type: application/json`. Не расширяй allowlist
до `*`.

### Schedule is empty or invalid

Production deploy требует Fitbase token и собирает production entrypoint.
Staging deploy собирает отдельный entrypoint с динамическими синтетическими
данными и не принимает Fitbase/Telegram credentials.
Smoke принимает только `{ ok: true, items: [] }`.

## Техническая посещаемость

Build добавляет на страницы stateless beacon. Он вызывает отдельную функцию
`zvenfit-site-traffic`, которая пишет access-like `site_page_view` в Cloud
Logging. Функция не использует runtime service account, Lockbox, HMAC, YDB или
Object Storage.

Перед первым deploy под администраторской учётной записью создай функции и
точные invoker bindings:

```bash
yc serverless function create --name zvenfit-site-traffic
yc serverless function add-access-binding \
  --name zvenfit-site-traffic \
  --role functions.functionInvoker \
  --subject system:allUsers

yc serverless function create --name zvenfit-site-traffic-staging
yc serverless function add-access-binding \
  --name zvenfit-site-traffic-staging \
  --role functions.functionInvoker \
  --subject serviceAccount:<YC_GATEWAY_SERVICE_ACCOUNT_ID>
```

Production вызывает функцию напрямую по CORS allowlist, staging — через
защищённый `/api/traffic` API Gateway. После этого workflow сам собирает и
обновляет версию функции.

Проверка кода без доступа к облаку:

```bash
npm run test:site-traffic
npm run test:monitoring
```

Создание log-based metric и dashboard Monium описано в
[`site-traffic-analytics.md`](site-traffic-analytics.md).

## Secret rotation

Runtime secrets ротируются в соответствующем GitHub Environment. WIF не имеет
долгоживущего secret. После перехода удали старые authorized/static access keys
и repository secrets, которые больше не читает workflow.
