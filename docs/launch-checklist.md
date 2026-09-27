# Production release checklist

Короткий повторяемый runbook для production-релизов ZvenFit. Первичная настройка Yandex Cloud, YDB, Telegram и GitHub Secrets вынесена в [`setup.md`](setup.md); мониторинг — в [`monitoring.md`](monitoring.md).

## Автоматическая публикация версии

Push в `main` запускает **Deploy to Production**. После успешных проверок,
деплоя функций и сайта и встроенного smoke-test job **Publish production release**
публикует Git-тег и GitHub Release на точный SHA этого запуска. Описание включает
автоматические release notes, SHA и ссылку на deployment run. Отдельно создавать
или отправлять тег вручную не требуется.

Версия рассчитывается от последнего стабильного тега `vMAJOR.MINOR.PATCH` по
сообщениям всех коммитов после него. При squash merge это итоговые сообщения PR:

| Изменения с предыдущей версии                                            | Повышение | Пример              |
| ------------------------------------------------------------------------ | --------- | ------------------- |
| `fix:`, `chore:`, `docs:` и остальные изменения без специальных маркеров | patch     | `v3.0.0` → `v3.0.1` |
| Есть `feat:` или `feat(scope):`                                          | minor     | `v3.0.1` → `v3.1.0` |
| Явно указан `feat!:`, `fix(scope)!:` или footer `BREAKING CHANGE:`       | major     | `v3.1.0` → `v4.0.0` |

Берётся наибольшее повышение среди изменений. Major требует осознанного breaking
маркера; выставлять его просто для крупной задачи не нужно. Даже deployment с
одними техническими изменениями получает patch-версию. Пропущенные через
`[skip ci]` коммиты войдут в следующий deployment. Поле `package.json.version`
не используется: этот приватный сайт не публикуется в npm.

Стабильные теги не перемещаются и не удаляются. Архивные теги `archive/*` и
prerelease-теги не участвуют в расчёте. Повторная выкладка уже опубликованного
коммита использует существующую версию. Старому невыпущенному коммиту после
более новой версии новая версия не присваивается; это не механизм rollback.

Если deployment и smoke прошли, а публикация версии упала:

1. Открой тот же workflow run и выбери **Re-run failed jobs**.
2. Успешные deployment jobs не нужно запускать заново. Если Git-тег уже создан,
   publication продолжится с ним; если Release уже существует, job завершится
   без изменений.
3. Если тег занят другим SHA, публикация остановится. Не передвигай тег для
   обхода ошибки: проверь конкурирующую ручную публикацию и историю версий.

Публикация использует встроенный `GITHUB_TOKEN` с `contents: write` только в
release job; отдельный PAT не нужен. Все jobs входят в общую последовательную
группу `deploy-production`. Публикация может восстановить пропущенный Release
старого существующего тега, но не назначит его latest поверх более новой версии.

Read-only просмотр предполагаемой версии для текущего checkout:

```bash
RELEASE_SHA=$(git rev-parse HEAD) node scripts/publish-production-release.cjs --dry-run
```

Перед просмотром нужны актуальные теги и полная история (`git fetch origin --tags`).
Staging с браузерными тестами пока запускается отдельно вручную и не является
обязательным условием production: см. [`staging-environment.md`](staging-environment.md).

## Перед merge

```bash
npm run lint
npm run test:lead-fn
npm run test:schedule-fn
npm run test:site-traffic
npm run test:staging-authorizer
npm run test:scripts
npm run test:build
```

- [ ] Все проверки завершились успешно.
- [ ] В diff нет секретов, персональных данных и реальных `.env*`; техническая документация проверена перед публикацией.
- [ ] Сообщение squash-коммита корректно задаёт тип изменения; breaking marker используется только по явному решению.
- [ ] Для изменений CSS/JS используется новый `ASSET_VERSION` — workflow всегда берёт номер текущего запуска.

## После deploy

1. Дождись успешного завершения workflow **Deploy to Production**, включая
   **Publish production release**. Ссылка на версию появится в summary этого job.
2. Smoke-test уже выполняется в workflow. При необходимости повтори его локально:

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
- [ ] Release опубликован, его тег указывает на SHA проверенного deployment.
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
