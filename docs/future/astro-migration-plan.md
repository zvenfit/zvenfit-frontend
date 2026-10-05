# План миграции фронтенда на Astro

Статус: discovery-план, составлен 2026-10-04, доработан 2026-10-05 по
результатам ревью. Для реализации не согласован. Ветка:
`docs/astro-migration-plan`. Решение о стеке и порядок работ обсуждаются с
владельцем по пунктам; после согласования план получает карточку проекта в
Personal AI Workspace и ссылку из PRJ-007 «Доработки фронтенда сайта».

Связанные записи: [`TODO.md`](../../TODO.md) («Footer duplication» отложен «до
перехода на шаблонизатор», «Auto-generate sitemap», «Navigation hierarchy»),
правило о стеке в [`AGENTS.md`](../../AGENTS.md), пункты 2, 4, 5, 6, 7, 8, 10 и
11 ревью фронтенда 2026-09-30 (карточка PRJ-007).

## 1. Решение и его границы

Сайт остаётся контентным: по плану интеграции с FitBase запись живёт в
приложении, личного кабинета и авторизации на сайте не будет, но на страницах
услуг и тренеров появятся API-виджеты (ближайшие занятия, свободные места).
Нужен не фреймворк приложения, а генератор статики со слоем исходников:
layout, компоненты, данные, конвейер ассетов.

| Вариант | Почему нет |
| --- | --- |
| Статус-кво, расширять маркеры `build-static.cjs` | 40 страниц правятся руками, 36 regex-замен по готовому HTML, общая часть `<head>` одинакова лишь на 5 страницах, меню в 4 вариантах |
| Vite сам по себе | бандлер, слоя шаблонов не даёт |
| Next.js со static export | React на всех страницах ради трёх виджетов; в export-режиме нет оптимизации картинок и редиректов; смысл появляется только с сервером, которого в Yandex Cloud у нас нет |
| SvelteKit, Nuxt static | фреймворк на каждой странице без выигрыша для контентного сайта |
| Eleventy | крепкий план Б: HTML как есть, data cascade, `eleventy-img`; слабее компонентная модель и схемы данных, агенты снова будут плодить варианты разметки |

Выбор: **Astro, статический вывод, без клиентского фреймворка по умолчанию.**
Островок на Preact или Svelte допустим позже для отдельного виджета, например
расписания, с обоснованием в PR. Это не часть миграции.

Проверено 2026-10-04: Astro 7.3.5, требует Node ≥ 22.12 (CI на Node 22,
локально 24), Vite 8. Компилятор Astro 7 строже к невалидному HTML, а
`compressHTML` по умолчанию `'jsx'` и убирает пробелы между inline-элементами:
оба пункта учтены в рисках.

## 2. Инварианты миграции

Что не меняется, пока идут этапы 1–6:

- URL всех 40 страниц и `404.html`, завершающий слэш, `index.html` в каталогах
  (`build.format: 'directory'`, `trailingSlash: 'always'`).
- `dist/` как единственный артефакт; тот же `aws s3 sync` с теми же правилами
  кэша: HTML, `robots.txt` и `sitemap.xml` без кэша, остальное `immutable`.
- Cloud Functions, API Gateway staging, Basic auth, релизный конвейер
  staging → E2E → production, E2E в `zvenfit-autotests`.
- Фирменный стиль; `zvenfit.webflow.css` остаётся глобальной таблицей;
  `webflow.js` и jQuery остаются до пункта 10 ревью.
- Аналитика, GTM и UTM на production; их отсутствие и `noindex` на staging;
  API-адреса staging через same-origin gateway (проверка
  `check-staging-build.cjs` сохраняет смысл, меняется только место проверки).
- **Паритет разметки.** Миграция переносит страницы, не меняя DOM, тексты,
  ссылки, meta и JSON-LD. Унификация меню и футеров, H1 тренеров, GTM, отказ
  от рантайма Webflow идут отдельными PR после переноса соответствующих
  страниц. Так проверка каждого PR сводится к сравнению выводов.

## 3. Факты, от которых отталкивается план

Снято с репозитория 2026-10-04 и 2026-10-05.

### Страницы и общие блоки

- 40 `index.html` плюс `404.html`, 827 KB исходного HTML. Меню: `menu1` на
  главной, `menu2` на 9 страницах услуг, `menu3` на 9 (юридические, контакты,
  расписание и другие), `menu2-coach` на 21 странице тренеров. 35 страниц
  несут `data-wf-page` и `data-wf-site` на `<html>`, 34 — комментарий Webflow
  «Last Published».
- Футер есть на 18 страницах. На 14 это Webflow-пара `section-4` (десктоп) и
  `section-3` (мобильный) с разделителем и iframe карты. Главная,
  `/contacts/platforms/` и `404.html` несут эту же пару плюс новый блок
  `footer-grid`/`footer-locations`. У `/raspisanie/` есть `section-4` и
  `footer-grid`, но нет `section-3` и карты. 23 страницы без футера: все 21
  тренер, `/promos/` и `/promos/apps/`. То есть компонент футера один, с
  флагом нового блока, а не «три поколения».
- Страницы тренеров: 13 из 21 имеют одинаковый скелет
  (`menu2-coach` → фото → карточка → разделитель → карточка → разделитель →
  `section-2` с карточками направлений → разделитель). Остальные отличаются
  только числом карточек направлений; одна страница без карточек и без
  одного разделителя. Сертификаты (ссылки на `documents/` в бакете) у 7
  тренеров. Слайдеров на страницах тренеров нет: `w-slider` живёт на 9
  страницах услуг.

### Сборка

- `build-static.cjs` (1027 строк) на каждую страницу по порядку: strip GTM на
  staging → замена iframe карты на регион из `maps.config.json` → сниппеты
  head (аналитика кроме staging, UTM) → Open Graph из title и description →
  JSON-LD из `structured-data.config.json` (полный граф на `/` и
  `/contacts/platforms/`) → бейджи приложений из сниппетов и
  `app-links.config.json` (без футерного блока на `/contacts/platforms/` и
  `/promos/apps/`) → скрипты карт → трафик-бикон (кроме 404) → `noindex` на
  staging → класс `slash-prefix` → cache-bust `?v=ASSET_VERSION`. Затем
  подстановка `LEAD_API_URL`, `SCHEDULE_API_URL`, `TRAFFIC_API_URL` в
  `js/*-config.js`, запись `maps-config.js` с `apiKey` из `Y_MAPS_API_KEY`,
  минификация CSS, фото организаций с Яндекс Карт по сети с fallback на
  `locationPhotos`, `robots.txt` для staging.
- `check-build.cjs` запрещает локальный `dist/js/webflow.js`, требует у каждой
  страницы из `public/` версионированный CDN-адрес `webflow.js` в сборке и
  **падает, если ни одна страница в `public/` не ссылается на `webflow.js`**.
  `check-webflow-layout.cjs` требует валидный `data-wf-page`, ≥ 90 %
  `w-node-*` покрыты CSS, нет дублей `id`; с нулём страниц проходит.
  `check-staging-build.cjs` проверяет `noindex`, отсутствие аналитики и
  staging-адреса API в `js/*-config.js`. Контракт проверок для Workspace:
  `project-checks.json`.
- Корневого `tsconfig.json` нет; `.astro/` не в `.gitignore`; ESLint линтит
  `public/js/**/*.js` как модули и держит overrides по путям
  `public/js/schedule.js` и `public/js/yandex-map.js` (`max-lines` выключен);
  Prettier без плагина для `.astro`.

### Ассеты

- В бакете `zvenfit/v2` 122 файла без `Cache-Control`, размер неизвестен
  (локально нет `aws` CLI, замер в этапе 0). Из CSS используются 81 файл как
  фоновые изображения, из HTML 37: favicon и webclip в `<link>` (82 ссылки),
  сертификаты тренеров в `<a href>` (34), `og:image` (2). На всём сайте один
  тег `<img>`. Вывод: компонент `<Image>` Astro почти не применим к текущей
  разметке; выигрыш по весу даёт отдельный шаг на sharp с переписыванием CSS,
  а Astro нужен для слоя шаблонов и данных. Форматы: PNG 100 ссылок, WebP 58,
  JPEG 49, SVG 5, GIF 1.
- Шрифты: Roadrage как `roadrage.ttf` 1,2 МБ из бакета через `@font-face`;
  Roboto и Roboto Condensed через `@import` с `fonts.bunny.net`, внешняя
  зависимость на каждой странице. Вендорные файлы из бакета:
  `normalize.min.css`, `webflow.min.css`, `jquery-3.5.1.min.js`, `webflow.js`.
- `robots.txt` запрещает `/js/` и `/css/`; после миграции ассеты лежат в
  `/_astro/`, правило становится мёртвым (передать в пункт 7 ревью).

### Скрипты

- Клиентский JS: 2546 строк, `schedule.js` 1272, `yandex-map.js` 768,
  `utm-attribution.js` 230, `lead-form.js` 194, остальное мелочь.
  `schedule.js`, `yandex-map.js`, `utm-attribution.js` и `traffic-beacon.js`
  обёрнуты в IIFE; `lead-form.js`, `coaches-show-more.js` и
  `accordion-horizontal.js` выполняются на верхнем уровне. Между файлами
  общих переменных нет, только явные `window.ZVENFIT_LEAD_API`,
  `window.ZVENFIT_SCHEDULE_API`, `window.ZVENFIT_TRAFFIC_API` и
  `window.ZVENFIT_MAPS`. Перевод в ES-модули безопасен при проверке по
  чек-листу этапа 4.
- jQuery в нашем коде не используется, только рантаймом Webflow: выпадашки на
  14 страницах, слайдеры на 9, табы на 3, интеракции `data-w-id` на 30.
  `webflow.js` требует глобальный jQuery, загруженный раньше классическим
  скриптом: бандлить их как модули нельзя.

### Автотесты

- 12 спек; 27 локаторов по классам, из них Webflow-специфичные
  `.w-dropdown-list`, `.w-dropdown-toggle`, `.w-slider`, `.section-3`,
  `.section-4`, `.div-block-6` в `tests/contracts/responsive-layout.spec.ts`,
  `tests/features/ui-controls.spec.ts`, `tests/features/club-card.spec.ts`,
  `tests/support/interaction-registry.ts`, `pages/training-prices.page.ts`.
  Классы и `id` при миграции сохраняются.
- Хелпер `tests/support/network.ts` блокирует все запросы не на origin сайта и
  разрешает по флагам CSS и шрифты из бакета и `fonts.bunny.net`
  (`allowLayoutResources`) и `js/` из бакета (`allowRuntimeResources`).
  Используется в 10 файлах: 6 вызовов с настройками по умолчанию, 5 с
  разрешёнными стилями, 4 с разрешённым рантаймом. **Когда ассеты переедут на
  origin сайта, блокировка перестанет действовать и тесты, написанные для
  страниц без Webflow CSS и без `webflow.js`, получат и то и другое.** Это
  меняет условия тестов, а не только селекторы; см. этап 5а.

## 4. Целевая структура

```
astro.config.mjs            site, trailingSlash, compressHTML: false, publicDir,
                            vite.build.emptyOutDir: false на время перехода
tsconfig.json               extends astro/tsconfigs/base
src/
  layouts/Base.astro        <html lang data-wf-page data-wf-site>, head, CSS, скрипты
  components/
    Menu.astro              variant: home | service | coach | plain  (menu1/2/2-coach/3)
    Footer.astro            Webflow-пара section-4/section-3 с MapRegion; флаг withGrid
                            для нового блока; у тренеров и промо футера нет
    MapRegion.astro         регион карты из maps.config.json (замена iframe)
    Analytics.astro         VK + Метрика (+ GTM до пункта 5), только production
    UtmHead.astro           снипет UTM
    OpenGraph.astro         из title/description страницы
    StructuredData.astro    из structured-data.config.json, full на / и контактах
    AppDownloadBadges.astro, AppDownloadPlatforms.astro, AppDownloadPromo.astro
    TrafficBeacon.astro
  pages/                    40 страниц + 404.astro + sitemap.xml.ts + robots.txt.ts
    trenery/[slug].astro    из коллекции
  content.config.ts         коллекция trainers (zod-схема)
  content/trainers/*.json   21 запись: slug, имя, роль, карточки направлений,
                            сертификаты, meta, позже fitbaseTrainerId
  data/                     app-links, maps, structured-data, map-photos snapshot
  scripts/                  schedule.js, lead-form.js, yandex-map.js, utm, beacon
  vendor/                   jquery-3.5.1.min.js, webflow.js: классические скрипты,
                            подключаются через импорт с ?url
  styles/                   zvenfit.webflow.css, klubnaya-karta.v1.css, fonts.css
  assets/images/, assets/fonts/, assets/documents/
static/ (на время миграции) → public/ (после)   favicon, webclip, прочее как есть
scripts/migrate/html-to-astro.cjs   одноразовый конвертер, удаляется в конце
scripts/migrate/pages.json          список перенесённых страниц
scripts/compare-dist.cjs            проверка паритета
scripts/inventory-bucket.cjs        инвентаризация бакета (этап 0)
```

Конфиги `scripts/*.config.json` переезжают в `src/data/` только на этапе 6,
до этого компоненты читают их по текущему пути.

## 5. Карта замен `build-static.cjs`

| Сейчас | После |
| --- | --- |
| копирование `public/` в `dist/` | вывод Astro в `dist/`, passthrough из `publicDir` |
| маркеры и сниппеты head, бейджи, секции приложений | компоненты в layout и на страницах |
| Open Graph из title/description | `OpenGraph.astro` из props страницы |
| JSON-LD из конфига | `StructuredData.astro`, те же данные, тот же выбор полного графа |
| замена iframe карты | `MapRegion.astro` по `maps.config.json` |
| скрипты карт и трафика | подключение в layout по props `hasMaps`, `trackViews` |
| `?v=ASSET_VERSION` | хэши Vite в `_astro/`; на время перехода layout воспроизводит CDN-адрес `webflow.js?v=` для паритета |
| минификация CSS | Vite при импорте стилей |
| `js/*-config.js` с подстановкой URL | `<script is:inline define:vars>` из `PUBLIC_*`-переменных или эндпоинты `*.js.ts` |
| `maps-config.js` с `apiKey` | эндпоинт `js/maps-config.js.ts` из данных и `PUBLIC_Y_MAPS_API_KEY` |
| strip GTM, `noindex`, `robots.txt` для staging | ветвление по `import.meta.env` в `Analytics.astro`, layout и `robots.txt.ts` |
| фото организаций с Яндекс Карт при сборке | prebuild-скрипт пишет снимок в `src/data/map-photos.json` (решение D4) |
| `slash-prefix` | применяется один раз при конвертации, в сборке не нужен |
| вендорные jQuery и `webflow.js` с CDN | файлы в `src/vendor/`, импорт `?url` даёт хэш, подключение `<script is:inline src>` в прежнем порядке: jQuery, затем `webflow.js` |
| ручной `sitemap.xml` | `src/pages/sitemap.xml.ts`: имя файла и `robots.txt` не меняются; интеграция `@astrojs/sitemap` не подходит, она пишет `sitemap-index.xml` |

## 6. Переходный режим сборки

Страницы переезжают партиями, сайт собирается двумя сборщиками до этапа 6.

1. `node scripts/build-static.cjs` как сейчас: очищает `dist/`, собирает
   страницы, оставшиеся в `public/`, копирует `css/`, `js/`, `robots.txt`,
   `sitemap.xml`.
2. `astro build` с `outDir: 'dist'`, `vite.build.emptyOutDir: false` и
   `publicDir: 'static'`, чтобы Astro не копировал `public/` целиком.
   Проверено по исходникам Astro (`core/build/static-build.ts`): каталог
   вывода очищается самим Astro, если `vite.build.emptyOutDir` не равен
   `false`; с `false` содержимое сохраняется. Страница, перенесённая в
   `src/pages`, удаляется из `public/`, и legacy-сборка сама перестаёт её
   видеть. Пересечений по путям нет.
3. `npm run build` вызывает оба шага; `test:build` и `test:build:staging`
   проверяют общий `dist/`.
4. После этапа 3 в `public/` не остаётся страниц, и legacy-сборка нужна только
   как passthrough для `css/`, `js/`, `robots.txt` и `sitemap.xml` с
   минификацией CSS и `?v=`. Этапы 4 и 5 забирают у неё скрипты и стили,
   этап 6 убирает её целиком.
5. Dev. `astro dev` на :4321 показывает только перенесённые страницы, legacy
   `dev:watch` на :4173 только оставшиеся; ссылка между ними даёт 404 на
   чужом порту. Это принятое ограничение перехода: `astro dev` используется
   для страницы, которую переносят, а проверка всего сайта делается через
   `npm run build` и `serve dist`. Прокси между портами не делаем.

Рассмотрено и отвергнуто: класть `.html`-страницы в `src/pages` как есть.
Astro так умеет, но такие страницы не получают layout и компоненты, а
legacy-постобработка `dist/` применялась бы к ним повторно.

## 7. Этапы и PR

Каждый PR проходит обычный релиз и становится production-выкладкой, поэтому
партии должны быть самодостаточными; откат — revert PR.

### Этап 0. Решение, правило, инвентаризация

- Согласовать этот план и решения из раздела 10.
- `scripts/inventory-bucket.cjs`: список 122 файлов бакета, размер каждого,
  где используется (CSS, HTML, нигде). Результат нужен до решения D1, а не
  после: от него зависит, сколько весит репозиторий после этапа 5.
- PR: правило в `AGENTS.md` (текст в разделе 12), запись в
  `docs/future/README.md`, карточка проекта в Workspace, PRJ-007 получает
  зависимость.

### Этап 1. Каркас и первая партия

- Установить `astro`; `astro.config.mjs`; `tsconfig.json`; `.astro/` в
  `.gitignore`; `prettier-plugin-astro`; `ASTRO_TELEMETRY_DISABLED=1` в
  `quality.yml`, `_deploy-environment.yml` и в документации локального
  запуска: Astro шлёт телеметрию по умолчанию.
- `Base.astro`, `Menu.astro` (пока вариант `plain`), `Footer.astro` для
  Webflow-пары без нового блока, `MapRegion`, `Analytics`, `UtmHead`,
  `OpenGraph`, `StructuredData`, `TrafficBeacon`. Layout воспроизводит
  CDN-адреса `normalize.min.css`, `webflow.min.css`, jQuery и
  `webflow.js?v=ASSET_VERSION` как у legacy-страниц.
- Конвертер `scripts/migrate/html-to-astro.cjs`: вынимает title, description,
  canonical, `data-wf-page`, вариант меню и футера, флаги карт и CSS страницы
  во frontmatter; тело страницы переносит как есть; inline-скриптам ставит
  `is:inline`, inline-стилям `is:global`, экранирует фигурные скобки,
  применяет `slash-prefix`; результат правится руками и прогоняется через
  компилятор Astro.
- `scripts/migrate/pages.json` и адаптация `check-build.cjs` в этом же PR:
  проверка «ни одна страница в `public/` не ссылается на `webflow.js`»
  отключается, пока `pages.json` не пуст; для страниц из `pages.json` та же
  проверка делается по `dist/`. Без этого `test:build` упадёт на последней
  партии этапа 3.
- `scripts/compare-dist.cjs` (раздел 8) и его запуск в `quality.yml`.
- Первая партия: `/privacy/`, `/offer/`, `/payment-policy/`. Все на `menu3`,
  с Webflow-парой футера и картой, без особых случаев.
- Готово, когда: паритет по трём страницам без расхождений, кроме
  согласованного списка (раздел 8), `test:build` и `test:build:staging`
  зелёные, релиз прошёл staging и E2E.

### Этап 2. Тренеры

- `content.config.ts` с коллекцией `trainers`, 21 JSON-запись, страница
  `trenery/[slug].astro` и `/trenery/` с `coaches-show-more.js`. Схема
  включает поля под будущий `fitbaseTrainerId` (необязательное).
- Критерий схемы: одна схема и один шаблон на все 21 страницу. Различия
  выражаются массивом карточек направлений (у 13 страниц одинаковый скелет,
  у остальных другое число карточек), необязательным списком сертификатов
  (7 страниц) и флагом для страницы без карточек. Спецшаблонов ноль.
- Паритет по 22 страницам. Следом отдельный PR: пункт 6 ревью (H1 с ФИО,
  title и description) в одном шаблоне.

### Этап 3. Услуги, главная, промо, клубная карта, расписание, форма, контакты

Три партии по 4–6 страниц:

- (а) `trenazhernyj-zal/*`, `personalnye-trenirovki`, `parnye-trenirovki`:
  меню `service`, слайдеры и выпадашки Webflow, маркеры `data-zvenfit-page`.
- (б) `pilates-na-reformere/*`, `gruppovye-trenirovki`, `klubnaya-karta`,
  `promos/*`: страницы без футера, CSS клубной карты, исключение футерного
  блока приложений на `/promos/apps/`.
- (в) особые случаи: главная (`menu1`, полный граф JSON-LD, обе семьи футера),
  `/contacts/platforms/` (полный граф, обе семьи футера, без футерного блока
  приложений), `/raspisanie/` (футер без `section-3` и карты, `schedule.js`),
  `/forma-dlya-zayavki/` (`lead-form.js`, девять inline-скриптов),
  `404` (обе семьи футера, без трафик-бикона).

Скрипты страниц подключаются как внешние файлы без изменений. Следом
отдельные PR: пункт 8 (H1 главной) и пункт 11 (уровни заголовков).

### Этап 4. Скрипты и конфигурация

- `public/js/*.js` переезжают в `src/scripts/` и подключаются через Vite как
  модули: хэширование вместо `ASSET_VERSION`. Чек-лист на каждый файл перед
  переносом: нет присваиваний необъявленным переменным, нет `this` на верхнем
  уровне, нет зависимости от порядка с другими нашими скриптами, глобали
  только через `window.ZVENFIT_*`. ESLint уже линтит файлы как модули, так что
  ожидаемых правок мало; overrides в `.eslintrc.js` переводятся на новые пути.
- jQuery и `webflow.js` остаются классическими скриптами: `src/vendor/`,
  импорт `?url`, `<script is:inline src>` в прежнем порядке. Это даёт хэш и
  кэш без смены семантики.
- API-адреса и ключ карт из `PUBLIC_LEAD_API_URL`, `PUBLIC_SCHEDULE_API_URL`,
  `PUBLIC_TRAFFIC_API_URL`, `PUBLIC_Y_MAPS_API_KEY`; workflow и `.env.example`
  переименовывают переменные; `check-staging-build.cjs` проверяет адреса в
  HTML страниц формы и расписания вместо файлов `*-config.js`.
- `.env.development` читается Astro напрямую; `mock-server` без изменений.

### Этап 5а. Подготовка автотестов

Делается в `zvenfit-autotests` до этапа 5, по правилу «сначала autotests,
потом SHA в этом репозитории».

- `tests/support/network.ts` учится блокировать ресурсы по пути `/_astro/` и
  по имени файла (`webflow`, `jquery`, `normalize`, `webflow.min`,
  `zvenfit.webflow`), а не только по хосту бакета; флаги
  `allowLayoutResources` и `allowRuntimeResources` сохраняют смысл.
- Прогон всех 15 вызовов хелпера против staging с ассетами на origin сайта;
  тесты, которые опирались на отсутствие Webflow CSS или `webflow.js`,
  переписываются явно.
- Пин нового SHA в `main.yml` и `staging.yml` отдельным PR здесь.

### Этап 5. Ассеты и кэш (пункты 2 и 4 ревью, решение D1)

- Скрипт `scripts/optimize-images.cjs` на sharp: из оригиналов (по
  инвентаризации этапа 0) генерирует WebP нужных ширин по фактической ширине
  карточек в `src/assets/images/`; CSS переписывается на локальные пути;
  `image-set()` там, где нужен fallback. В репозиторий коммитятся только
  оптимизированные файлы, оригиналы остаются в бакете как архив.
- Roadrage в WOFF2 с `font-display`, Roboto самохостинг вместо
  `fonts.bunny.net`, `normalize.min.css` и `webflow.min.css` локально через
  Vite. Все попадают в `_astro/` с хэшем и `immutable`.
- Favicon и webclip в `static/`: они не хэшируются и получат `immutable` на
  год, поэтому смена картинки требует нового имени файла. Сертификаты
  тренеров в `src/assets/documents/`, ссылки через импорт.
- `check-build.cjs`: запрет локального `webflow.js` снимается, вместо него
  проверка, что `dist/` не ссылается на `storage.yandexcloud.net/zvenfit/v2`.
- Готово, когда: главная на телефоне ≤ 1,5 МБ (замер до и после в карточку
  проекта), ни одной ссылки на бакет в `dist/`, E2E зелёные с новым SHA.

### Этап 6. Вывод legacy-сборки

- Удалить `build-static.cjs`, `watch-static.cjs`, сниппеты, конвертер,
  `pages.json`; `publicDir` обратно в `public/`; конфиги в `src/data/`;
  `vite.build.emptyOutDir` обратно по умолчанию.
- Проверки: дубли `id` и покрытие `w-node-*` переносятся на `dist/` в
  `check-build.cjs`; `check-webflow-layout.cjs` и `webflow-layout.test.cjs`
  удаляются; `project-checks.json`, `package.json`, `quality.yml`,
  `_deploy-environment.yml`, README, AGENTS.md, `knowledge-base/` обновлены.
- `sitemap.xml.ts` закрывает TODO «Auto-generate sitemap»; мёртвые правила
  `/js/` и `/css/` в `robots.txt` уходят в пункт 7 ревью.

### После миграции, в рамках PRJ-007

- Пункт 5: цели из кода, GTM убирается в `Analytics.astro`.
- Пункт 10: отказ от `webflow.js` и jQuery, свои выпадашки, слайдеры, табы;
  обновление пяти файлов автотестов с Webflow-классами.
- Пункт 3: вид расписания на телефоне, при необходимости островок.
- TODO «Footer duplication» и «Navigation hierarchy»: один футер и одно меню.

## 8. Паритет и проверки

`scripts/compare-dist.cjs` сравнивает вывод legacy-сборки базовой ветки и
вывод Astro текущей ветки **только для страниц, добавленных в `pages.json` в
этом PR**: у `main` нет legacy-версии уже перенесённых страниц, а последующие
PR с H1 и title расходятся с базой намеренно.

Сравниваются:

- `<title>`, description, canonical, robots, Open Graph и Twitter meta;
- JSON-LD как разобранный JSON;
- `data-wf-page`, `data-wf-site`, `lang`;
- последовательность заголовков с текстом; множество `id`; все `href`
  внутренних ссылок; `src`/`href` скриптов и стилей без хэшей и `?v=`;
- видимый текст с нормализованными пробелами.

Исключения по умолчанию: порядок атрибутов, хэши и `?v=` в адресах ресурсов,
URL фото организаций с `avatars.mds.yandex.net` (сборка берёт их по сети на
каждом запуске, база и PR могут получить разные), пробелы между тегами.

Запуск в `quality.yml`: собрать `origin/main` legacy-сборкой во временный
каталог, собрать PR, сравнить страницы из diff `pages.json`. Локально та же
команда. Другие расхождения допускаются только по явному списку в PR.

Дальше обычный релиз: staging, E2E из `zvenfit-autotests`, production, smoke.
Вес страниц замеряется до этапа 5 и после.

## 9. Риски

| Риск | Мера |
| --- | --- |
| Компилятор Astro 7 падает на невалидном HTML экспорта | конвертер прогоняет страницу через компилятор; правки руками, фиксируются в PR |
| `compressHTML: 'jsx'` ломает inline-раскладку | `compressHTML: false` в конфиге навсегда, проверка в `check-build` |
| Фигурные скобки в тексте трактуются как выражения | конвертер экранирует; `is:raw` для блоков с кодом |
| Inline-скрипты и стили обрабатываются Astro | `is:inline` для GTM и конфигов, `is:global` для стилей |
| `webflow.js` и интеракции зависят от `data-wf-page`, `data-wf-site`, `w-node-*` | атрибуты передаются в layout props и сохраняются до пункта 10 |
| jQuery и `webflow.js` перестают быть глобальными при бандлинге | только `?url` и `<script is:inline src>`, порядок jQuery → `webflow.js` |
| Порядок CSS: normalize → webflow → zvenfit | явный порядок импортов в `Base.astro`, проверка в compare-dist |
| E2E меняют условия, когда ассеты уходят с бакета на origin сайта | этап 5а до этапа 5, пин SHA, прогон на staging |
| `check-build.cjs` падает без страниц в `public/` | адаптация на этапе 1 вместе с `pages.json` |
| Переписывание фонов в CSS ломает отображение | этап 5 отдельными PR по группам картинок, проверка на staging и E2E |
| Favicon и webclip под `immutable` без хэша | смена картинки только с новым именем файла |
| Рост зависимостей, sharp с нативными бинарниками | `npm ci` в CI, Dependabot version updates (D3), CodeQL без изменений |
| Каждый PR — релиз в production | партии самодостаточны, откат через revert |
| Dev на двух портах | принятое ограничение: полный сайт проверяется через `npm run build` и `serve dist` |
| Параллельная работа над страницами в `public/` | перенесённые страницы правятся только в `src/pages`; список в `pages.json` |

## 10. Решения владельца

- **D1.** Картинки, шрифты и вендорные файлы переезжают в репозиторий
  (пункт 1 открытых вопросов PRJ-007). Коммитятся только оптимизированные
  файлы; оригиналы остаются в бакете как архив. Решение принимается после
  инвентаризации этапа 0, когда известен размер. План исходит из «да».
- **D2.** Принцип паритета: миграция не меняет разметку, унификация меню и
  футеров отдельными PR после. Альтернатива: объединять и принимать больший
  объём ручной проверки.
- **D3.** Security-алерты Dependabot уже включены (на `main` два moderate по
  `brace-expansion` в корневом `package-lock.json`, закрываются отдельным
  `chore/`-PR). Решение только про автоматические PR с обновлениями версий
  для корневого `package.json` и функций.
- **D4.** Фото организаций с Яндекс Карт: коммитить снимок в `src/data/` и
  обновлять скриптом вместо запроса на каждой сборке.
- **D5.** Островки на клиентском фреймворке: не в миграции; решение при работе
  над пунктом 3.
- **D6.** Формулировка правила в `AGENTS.md` (раздел 12).

## 11. Не входит

Редизайн, чистка Webflow CSS, перевод скриптов на TypeScript, изменение
текстов и цен, отказ от рантайма Webflow, GTM, юридические вопросы, настройки
CDN и редиректов (пункты 7 и 9 ревью идут независимо).

## 12. Оценка и изменения в документации

Рабочие дни агентной разработки с ревью владельца, без ожиданий релизов:

| Этап | Оценка |
| --- | --- |
| 0. Инвентаризация, правило, карточка | 0,5–1 |
| 1. Каркас, паритет, адаптация проверок, 3 страницы | 2–3 |
| 2. Тренеры и коллекция | 2–3 |
| 3. Три партии страниц | 3–5 |
| 4. Скрипты и конфигурация | 1–2 |
| 5а. Автотесты и пин SHA | 1–2 |
| 5. Ассеты и кэш | 2–4 |
| 6. Вывод legacy и документация | 1–2 |
| PR-довески после этапов 2 и 3 (пункты 6, 8, 11) | 1–2 |

Текст правила для `AGENTS.md` после этапа 0:

> Фронтенд собирается Astro в статический `dist/`; страницы живут в
> `src/pages`, общая разметка в `src/layouts` и `src/components`, данные в
> `src/content` и `src/data`. Клиентский фреймворк на страницах не
> используется; островок допустим для отдельного виджета с обоснованием в PR.
> До завершения миграции часть страниц остаётся в `public/` и собирается
> `scripts/build-static.cjs`; список перенесённых страниц в
> `scripts/migrate/pages.json`. Не предполагать React или Next.

Обновляются также: README (быстрый старт, архитектура, где менять код),
`project-checks.json`, `TODO.md` (закрытые пункты), `knowledge-base/_index.md`,
карточки Workspace. Этот файл после согласования переезжает из `docs/future/`
в `docs/` как действующий план.
