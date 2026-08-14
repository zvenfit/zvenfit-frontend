# Backend architecture

## Цель

Production-интеграции и staging-данные разделены не runtime-флагом, а кодом,
composition root и сборочным артефактом. Неверное значение env не может
переключить production Function на synthetic provider или staging Function на
Telegram/Fitbase.

## Направление зависимостей

```text
Cloud entrypoint (composition root)
  ├─> application handler -> ports and public contracts
  └─> adapters (YDB, Telegram, Fitbase, staging sink/fixtures) -> ports
```

Application handler не создаёт adapters, не читает provider-mode из env и не
проверяет конкретный subtype. Все внешние зависимости передаются через
`HandlerDependencies` и узкие provider/sender interfaces.

## Lead intake

- `src/handler.ts` — HTTP/timer orchestration и lead use-case;
- `src/notification/delivery.ts` — provider-neutral outbox/retry workflow;
- `src/ydb/` — persistence adapters;
- `src/telegram/delivery.ts` — только Telegram transport;
- `src/composition/production.ts` — production wiring;
- `src/staging-entry/` — staging wiring и sink без внешних side effects.

Схема YDB сохраняет исторические `telegram_*` имена до отдельной обратимо
совместимой миграции. Это persistence detail; staging/production provider
больше не выбирается внутри workflow.

## Schedule

- `src/handler.ts` — provider-neutral schedule use-case;
- `src/types.ts` — публичный schedule contract и ports;
- `src/fitbase/` и `src/providers/fitbase-provider.ts` — production adapter;
- `src/composition/production.ts` — production wiring и error policy;
- `src/staging-entry/` — synthetic provider, staging policy и entrypoint.

Fitbase transport types находятся внутри `src/fitbase/` и не входят в общий
application contract.

## Артефакты

| Function | Production | Staging |
| --- | --- | --- |
| lead-intake | `build/index.js`, Telegram включён | `build-staging/staging-entry/index.js`, Telegram отсутствует |
| fitbase-schedule | `build/index.js`, Fitbase включён | `build-staging/staging-entry/index.js`, fixtures включены |

`tsconfig.build.json` и `tsconfig.staging.json` начинают компиляцию с разных
entrypoints. TypeScript добавляет только транзитивно достижимые модули.
Artifact-тесты рекурсивно проверяют отсутствие запрещённых adapters, secrets и
runtime mode flags в противоположной сборке.

Deploy scripts принимают только `DEPLOYMENT_ENVIRONMENT=production|staging` и
дополнительно проверяют access boundary:

- production → public Function + production artifact;
- staging → private Function behind Gateway + staging artifact.

Telegram/Fitbase credentials добавляются только в environment production
версии. Staging workflow их не наследует и staging scripts их не передают.

## Правила расширения

1. Новый внешний сервис оформляется adapter, реализующим port application
   слоя.
2. Новый environment получает отдельный composition root и build config, если
   меняется поведение или набор внешних интеграций.
3. Нельзя добавлять `*_MODE`, `isFixture` или проверку environment в handler и
   adapters для выбора реализации.
4. Synthetic data живут только в staging/local outer layer.
5. Любое изменение границы сопровождается unit-тестом composition и
   artifact-isolation test.
