# Personal AI Workspace

Репозиторий подключается к Personal AI Workspace по контракту версии **1.0.4**:

- Repository: `REP-001`, `zvenfit-frontend`.
- Product: `PROD-001`, «Сайт ZvenFit».
- Domain: `zvenfit`.
- Канонические карточки: `10 Domains/Zvenfit/Repositories/zvenfit-frontend`
  и `10 Domains/Zvenfit/Products/Сайт ZvenFit` внутри Workspace `vault/`.

Карточки Workspace задают связи; `repo-manifest.json` отражает их идентификаторы.
`project_ids` пуст: подключение существующего продукта не создаёт отдельную
инициативу с вымышленными целями или сроками.

## Где хранить знания

Бизнес-контекст, цели, исследования, проектные планы и статусы ведутся в Workspace.
Код, технические решения, архитектура, сборка, тестирование и runbook остаются
в этом репозитории. `knowledge-base/` сохраняется как техническая KB.
Для общего материала выбирается один источник правды, из второго места ставится
ссылка. Автоматического копирования KB и истории разговоров нет.

## Локальная связь

Путь к указателю определяется средствами Git:

```bash
git rev-parse --git-path personal-ai-workspace/local.json
```

Указатель хранится внутри Git metadata, а сопоставление `REP-001` с папкой кода —
в machine-local `config/local.json` Workspace. Эти файлы не входят в Git.
Обычный clone репозитория переносит manifest и инструкции, но требует повторного
локального подключения через Workspace `repo_bridge.py connect`.

Из корня установленного Workspace проверить связь можно командой:

```bash
python3 scripts/repo_bridge.py locate --repo-id REP-001 --client codex \
  --purpose "Работа с текущей задачей zvenfit-frontend" --allow-sensitive
```

Для Workspace CLI требуется Python 3.14 или новее. Результат `locate` содержит
метаданные; перед чтением каждой конкретной note нужен отдельный
`cloud_preflight.py` по правилам Workspace. Недоступная связь не разрешает
сканировать соседние проекты или весь vault.

## Проверки

`project-checks.json` перечисляет существующие команды из `package.json`.
Это локальный способ запуска проверок; CI продолжает использовать свои workflow.
Browser E2E по-прежнему принадлежат только `zvenfit-autotests`.

```bash
python3 scripts/check.py --list
python3 scripts/check.py --execute-reviewed <review_digest> --check lint-public
```

`review_digest` берётся из предыдущего запуска и относится к точным байтам
`project-checks.json`. По умолчанию runner только показывает список. Проверки,
создающие build-артефакты, требуют `--allow-writes`; сборка с загрузкой фото
Yandex Maps также требует `--allow-network`. Эти флаги подтверждают выбранные
действия, но сами по себе не создают OS sandbox.

`scripts/check.py`, `scripts/secret_scan.py` и `scripts/bip39-english.txt` взяты
без изменений из `blueprints/code-repo/scripts/` Personal AI Workspace 1.0.4,
commit `7059c314d4713480323fd715794d2bd87781a234`. Последний файл — стандартный
словарь для обнаружения секретоподобных значений, не пользовательская seed-фраза.
Обновление Workspace не перезаписывает этот bundle автоматически: новую версию
нужно отдельно проверить и обновить в репозитории.
