# План миграции фронтенда на Astro

Редакция 3 от 2026-10-19. История: черновик 2026-10-04, редакция 2 после
собственного ревью 2026-10-05, раздел TypeScript 2026-10-12, независимое ревью
двух рецензентов 2026-10-12 (около 45 находок, 6 блокеров), решения владельца
2026-10-19 (раздел 11). Статус: решения приняты, план исполняется с этапа 0;
до merge PR этапа 0 файл остаётся в `docs/future/`.

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
| Статус-кво, расширять маркеры `build-static.cjs` | 40 страниц правятся руками, 36 regex-замен по готовому HTML, общая часть `<head>` живёт в 41 копии, меню в 4 вариантах |
| Vite сам по себе | бандлер, слоя шаблонов не даёт |
| Next.js со static export | React на всех страницах ради трёх виджетов; в export-режиме нет оптимизации картинок и редиректов; смысл появляется только с сервером, которого в Yandex Cloud у нас нет |
| SvelteKit, Nuxt static | фреймворк на каждой странице без выигрыша для контентного сайта |
| Eleventy | крепкий план Б: HTML как есть, data cascade, `eleventy-img`; слабее компонентная модель и схемы данных, агенты снова будут плодить варианты разметки |

Выбор: **Astro, статический вывод, без клиентского фреймворка по умолчанию.**
Островок на Preact или Svelte допустим позже для отдельного виджета, например
расписания, с обоснованием в PR. Это не часть миграции.

**Форма миграции: два релиза, а не партии.** Релиз A переводит сборку и все
41 страницу разом в одной ветке и сразу выводит legacy-сборку; релиз B
переносит ассеты. Инкрементальный путь с двойной сборкой отвергнут 2026-10-19:
все шесть блокеров независимого ревью сидели в переходной механике (двойная
сборка, список перенесённых страниц, адаптации проверок на каждую партию, два
режима паритета, dev на двух портах), а ценность ранней обратной связи от
production для контентного сайта не окупает эту механику.

Проверено 2026-10-12: Astro 7.3.8, требует Node ≥ 22.12 (CI на Node 22,
локально 24), Vite 8. Компилятор Astro 7 строже к невалидному HTML;
`compressHTML` по умолчанию `'jsx'` и убирает пробелы между inline-элементами;
Vite инлайнит ассеты меньше 4 КБ. Все три пункта закрыты настройками в
разделе 4.

## 2. Инварианты

Что не меняется в релизах A и B:

- URL всех 40 страниц и `404.html`, завершающий слэш, `index.html` в каталогах
  (`build.format: 'directory'`, `trailingSlash: 'always'`).
- `dist/` как единственный артефакт и Object Storage как хостинг. Правила кэша:
  HTML, `robots.txt`, `sitemap.xml` и `js/*-config.js` без кэша, остальное
  `immutable`. Порядок проходов `aws s3 sync` меняется в релизе B (раздел 6).
- Cloud Functions, API Gateway staging, Basic auth, релизный конвейер
  staging → E2E → production, владение E2E у `zvenfit-autotests`.
- Фирменный стиль; `zvenfit.webflow.css` остаётся глобальной таблицей;
  `webflow.js` и jQuery остаются до пункта 10 ревью.
- Аналитика, GTM и UTM на production; их отсутствие и `noindex` на staging;
  API-адреса staging через same-origin gateway; `robots.txt` staging
  побайтно равен `User-agent: *\nDisallow: /\n`.
- **Строгий паритет в релизе A.** Разметка, тексты, ссылки, meta, JSON-LD,
  inline-скрипты и атрибуты `data-wf-*`/`w-node-*` не меняются. Единственное
  согласованное отклонение: `public/offer/index.html` подключает `webflow.js`
  без `defer`, общий layout выровняет его с остальными. H1 тренеров, H1
  главной, уровни заголовков (пункты 6, 8, 11), GTM, отказ от рантайма
  Webflow, унификация меню и футеров идут отдельными PR после релиза A.

## 3. Факты, от которых отталкивается план

Снято с репозитория 2026-10-04, 2026-10-05 и 2026-10-12; числа считаются по
41 файлу, если не сказано иное.

### Страницы и общие блоки

- 40 `index.html` плюс `404.html`, 827 KB исходного HTML. Меню: `menu1` на
  главной, `menu2` на 9 страницах услуг, `menu3` на 9 страницах и `404`,
  `menu2-coach` на 21 странице тренеров. 35 страниц несут `data-wf-page` и
  `data-wf-site` на `<html>`, 34 — комментарий Webflow «Last Published».
  Общая часть `<head>` после нормализации одинакова на 24 страницах, но живёт в
  41 копии; содержательно отличаются главная, клубная карта и `404`.
- Футер есть на 18 страницах. На 14 это Webflow-пара `section-4` (десктоп) и
  `section-3` (мобильный) с разделителем и iframe карты. Главная,
  `/contacts/platforms/` и `404.html` несут эту же пару плюс новый блок
  `footer-grid`/`footer-locations`. У `/raspisanie/` есть `section-4` и
  `footer-grid`, но нет `section-3` и карты. 23 страницы без футера: все 21
  тренер, `/promos/` и `/promos/apps/`. Компонент футера один, с флагом нового
  блока.
- Страницы тренеров. Общий скелет у всех: `menu2-coach` → фото с
  модификатором класса (`photo_coach anna` и так далее) → карточка с именем
  (`h2.heading-page`) и ролью (`h3.text-block`) → разделитель → карточка со
  списками (`ul.list`, заголовки `li.heading-3`: «направления:»,
  «Образование:», «Спортивные достижения:», «Специализации:» и ещё шесть
  вариантов с разным регистром) → разделитель. У 8 страниц дальше идёт
  `section-2` «Сертификаты» с карточками `cat_card areas` (34 ссылки на
  `documents/` в бакете у 7 тренеров; у одной страницы `section-2` пустой).
  В конце ссылка на следующего тренера (`link-block-page4`, кольцо) и кнопка
  «записаться к …» с именем в дательном падеже. Слайдеров на страницах
  тренеров нет: `w-slider` живёт на 8 страницах услуг и главной.
- Интерактив Webflow: выпадашки на 15 страницах, слайдеры на 9, табы на 3,
  интеракции `data-w-id` на 30. `coaches-show-more.js` подключён только на
  `/gruppovye-trenirovki/`. На странице формы 4 inline-скрипта и 4 внешних.

### Сборка и проверки

- `build-static.cjs` (1027 строк): минификация CSS и удаление локального
  `webflow.js` до цикла; на каждую страницу: strip GTM на staging → замена
  iframe карты на регион из `maps.config.json` → сниппеты head (аналитика
  кроме staging, UTM) → Open Graph из title и description → JSON-LD из
  `structured-data.config.json` (полный граф на `/` и `/contacts/platforms/`,
  `Person` и хлебные крошки тренеров из блока `trainers` на 8 записей) →
  бейджи приложений (без футерного блока на `/contacts/platforms/` и
  `/promos/apps/`) → скрипты карт → трафик-бикон (кроме 404) → `noindex` на
  staging → класс `slash-prefix` → cache-bust `?v=ASSET_VERSION`. После цикла:
  `robots.txt` для staging, подстановка `LEAD_API_URL`, `SCHEDULE_API_URL`,
  `TRAFFIC_API_URL` в `js/*-config.js`, запись `maps-config.js` с `apiKey` из
  `Y_MAPS_API_KEY`, фото организаций с Яндекс Карт по сети с fallback.
- `check-build.cjs` делает 33 проверки: `dist/index.html`, `maps-config.js`
  без плейсхолдера и с `window.ZVENFIT_MAPS` (исполняется в `vm`), CDN-адрес
  `webflow.js` на каждой странице из `public/` (и падение, если таких страниц
  ноль), форма (дубли `id`, `method="post"`, нативный select, `role="alert"`,
  SVG-шеврон), клубная карта (дубли `id`, canonical, `?v=` у CSS и скриптов,
  `data-map-set`, ≥ 8 CTA, `main#main-content`, `#contacts`, стили со scope по
  `data-zvenfit-page`), ссылка «Самостоятельно» в тренажёрном зале, логотип
  512×512, трафик-скрипты на главной, `404` без бикона, логотип в JSON-LD,
  `prefers-reduced-motion`; читает `public/css/zvenfit.webflow.css` напрямую.
- `webflow-layout.test.cjs` требует `checkedPages > 0` и читает две страницы из
  `public/`; входит в `test:scripts` и `test:layout`. `check-staging-build.cjs`
  проверяет `noindex`, отсутствие аналитики, байт-в-байт `robots.txt` и
  staging-адреса в `dist/js/*-config.js`. `test:build` и
  `test-staging-build.cjs` вызывают `build-static.cjs` напрямую.
- `smoke-production.cjs` запускается в деплое после заливки и на staging, и
  на production: ищет на странице формы `<script src="…/js/lead-form.js">`,
  `/js/traffic-beacon.js`, `/js/lead-config.js`, `/js/traffic-config.js`, на
  расписании `/js/schedule.js` и `/js/schedule-config.js`, скачивает конфиги
  и читает `window.ZVENFIT_*`. Регулярка требует литерал `/js/<имя>`.
- `deploy-lead-intake.test.cjs` требует `ASSET_VERSION: ${{ github.run_number }}`
  в `_deploy-environment.yml` и запрещает npm-скрипты с именами по маске
  `playwright|tests?[:/]e2e|tests?[:/]staging`.
- Окружение: workflow передаёт `NODE_ENV` (`staging`/`production`),
  `LEAD_API_URL`, `SCHEDULE_API_URL`, `TRAFFIC_API_URL`, `Y_MAPS_API_KEY`,
  `ASSET_VERSION`; CI автотестов и `npm run dev` используют
  `NODE_ENV=development`. Astro режимы задаются флагом `--mode`, не `NODE_ENV`;
  `.env.development` читается только в режиме `development`.
- Корневого `tsconfig.json` нет; `.astro/` не в `.gitignore`; ESLint линтит
  `public/js/**/*.js` как модули, overrides `max-lines` на `schedule.js` и
  `yandex-map.js`, правило `import/no-default-export`; Prettier без плагина
  для `.astro`. Репозиторий на GitHub публичный.

### Ассеты

- В бакете `zvenfit/v2` по данным ревью 2026-09-30 122 файла без
  `Cache-Control`; листинг бакета закрыт, размер неизвестен. Из репозитория
  ссылаются 127 уникальных URL: 81 фон в `zvenfit.webflow.css`, 6 фонов в
  `klubnaya-karta.v1.css`, favicon и webclip в `<link>` (82 ссылки),
  сертификаты тренеров в `<a href>` (34), `og:image` из
  `structured-data.config.json` (`webclip.png`), три SVG-бейджа из
  `app-links.config.json`, два пина и 8 фото локаций из `maps.config.json`.
  На всём сайте один тег `<img>`. По уникальным файлам: JPEG 63, WebP 37,
  PNG 16, SVG 5, GIF 1. Вывод: компонент `<Image>` Astro почти не применим,
  выигрыш по весу даёт скрипт на sharp с переписыванием CSS.
- Шрифты: Roadrage как `roadrage.ttf` из бакета через `@font-face`; Roboto и
  Roboto Condensed через `@import` с `fonts.bunny.net`. Вендорные файлы из
  бакета: `normalize.min.css`, `webflow.min.css`, `jquery-3.5.1.min.js`,
  `webflow.js?v=`.
- `robots.txt` запрещает `/js/` и `/css/`; после релиза B ассеты лежат в
  `/_astro/`, правило становится мёртвым (пункт 7 ревью).

### Скрипты

- 2546 строк: `schedule.js` 1272, `yandex-map.js` 768, `utm-attribution.js`
  230, `lead-form.js` 194, остальное мелочь. `schedule.js`, `yandex-map.js`,
  `utm-attribution.js` и `traffic-beacon.js` обёрнуты в IIFE; `lead-form.js`,
  `coaches-show-more.js` и `accordion-horizontal.js` выполняются на верхнем
  уровне. Общих переменных между файлами нет, только `window.ZVENFIT_LEAD_API`,
  `window.ZVENFIT_SCHEDULE_API`, `window.ZVENFIT_TRAFFIC_API` и
  `window.ZVENFIT_MAPS`.
- jQuery в нашем коде не используется, только рантаймом Webflow. `webflow.js`
  требует глобальный jQuery, загруженный раньше классическим скриптом.

### Автотесты

- 12 спек, 11 вызовов `blockNonEssentialResources` в 10 файлах: 6 с
  настройками по умолчанию, 5 с `allowLayoutResources`, из них 4 ещё и с
  `allowRuntimeResources`. Хелпер блокирует всё не с origin сайта и по флагам
  пропускает CSS и шрифты с хоста бакета и `fonts.bunny.net` и `js/` с хоста
  бакета. Same-origin запросы проходят всегда. **Пока вендорные CSS/JS и
  шрифты остаются в бакете (до релиза B), условия тестов не меняются.**
- Стабы `tests/support/api-stubs.ts` перехватывают `**/js/lead-config.js*` и
  `**/js/schedule-config.js*`; на них держатся фичи формы и расписания.
- Webflow-классы в локаторах: `.w-dropdown-list`, `.w-dropdown-toggle`,
  `.w-slider`, `.section-3`, `.section-4`, `.div-block-6` в пяти файлах;
  маршруты берутся из `dist/sitemap.xml` (`<loc>https://zvenfit.ru/…`).
- CI автотестов (`quality.yml`, ежедневный `production-smoke.yml`) сам
  чекаутит `zvenfit-frontend@main`, делает `npm ci` и `npm run build` с
  `NODE_ENV=development` на Node 22, затем раздаёт `dist/`. После релиза A там
  выполняется `astro build`. Локальный прогон: `ZVENFIT_FRONTEND_PATH=<путь к
  checkout> npm run check` в `zvenfit-autotests`.
- Релизный E2E на staging это `tests/staging/staging.spec.ts`, 7 тестов.
  Environment staging разрешает деплой только из `main`: прогнать ветку на
  staging до merge нельзя.

## 4. Целевая структура

```
astro.config.mjs            site 'https://zvenfit.ru', trailingSlash 'always',
                            compressHTML false, build.inlineStylesheets 'never',
                            vite.build.assetsInlineLimit 0
tsconfig.json               extends astro/tsconfigs/strict
src/
  layouts/Base.astro        <html lang data-wf-page data-wf-site>, head, CSS, скрипты
  components/
    Menu.astro              variant: home | service | coach | plain  (menu1/2/2-coach/3)
    Footer.astro            Webflow-пара section-4/section-3 с MapRegion;
                            флаги withGrid, withMobile, withMap
    MapRegion.astro         регион карты из maps.config.json (замена iframe)
    Analytics.astro         VK + Метрика + GTM (до пункта 5), только mode production
    UtmHead.astro           снипет UTM
    OpenGraph.astro         из title/description страницы
    StructuredData.astro    из structured-data.config.json и коллекции тренеров
    AppDownloadBadges.astro, AppDownloadPlatforms.astro, AppDownloadPromo.astro
    TrafficBeacon.astro
  pages/                    40 страниц, 404.astro, sitemap.xml.ts, robots.txt.ts,
                            js/lead-config.js.ts, js/schedule-config.js.ts,
                            js/traffic-config.js.ts, js/maps-config.js.ts
    trenery/[slug].astro    из коллекции
  content.config.ts         коллекция trainers (zod-схема, раздел 7, этап A2)
  content/trainers/*.json   21 запись
  data/                     app-links, maps, structured-data, map-photos snapshot
  scripts/                  schedule.js, lead-form.js, yandex-map.js, utm, beacon,
                            coaches-show-more.js, accordion-horizontal.js
  vendor/ (релиз B)         jquery-3.5.1.min.js, webflow.js, normalize.min.css,
                            webflow.min.css: подключаются через импорт ?url
  styles/                   zvenfit.webflow.css, klubnaya-karta.v1.css, fonts.css
  assets/ (релиз B)         images/, fonts/
public/                     только статика как есть: favicon, webclip, images/*.svg
scripts/migrate/html-to-astro.cjs   одноразовый конвертер, удаляется после релиза A
scripts/compare-dist.cjs            проверка паритета
scripts/inventory-bucket.cjs        инвентаризация бакета (этап 0)
scripts/optimize-images.cjs         sharp-конвейер (релиз B)
```

Конфиги `scripts/*.config.json` переезжают в `src/data/` в релизе A; блок
`trainers` из `structured-data.config.json` уходит в коллекцию.

### TypeScript

- Astro компилирует frontmatter `.astro`-файлов и обрабатываемые `<script>`
  как TypeScript по умолчанию. `tsconfig.json` расширяет
  `astro/tsconfigs/strict`; `@astrojs/check` в devDependencies, `astro check`
  в `quality.yml` с этапа A1: типы компонентов, props и схем коллекций.
- Схема коллекции тренеров на zod даёт типы данных без ручного описания;
  ошибка в JSON-записи ломает сборку, а не страницу.
- Новые клиентские скрипты пишутся сразу в `src/scripts/*.ts`. Существующие
  `.js` переезжают в релизе A как есть: цель — хэширование и модули, а не
  переписывание.
- Перевод существующих скриптов на `.ts` — отдельная итерация после
  миграции, вместе с их ревизией (раздел «После миграции»). Порядок: сначала
  `// @ts-check` с JSDoc без переименования, потом `.ts` файл за файлом;
  поведение не меняется, проверка — те же E2E.
- Общие типы контрактов API (расписание, заявка, трафик) между функциями и
  скриптами сайта — кандидат для общего пакета по PRJ-009, в миграцию не
  входит. Функции уже на TypeScript и не затрагиваются.

### Конвертер

`scripts/migrate/html-to-astro.cjs` детерминирован: та же страница на входе
даёт тот же `.astro` на выходе, поэтому правку в `public/`, попавшую в `main`
во время ветки A, можно переконвертировать одной командой. Что делает:

- вынимает title, description, canonical, `data-wf-page`, `data-wf-site`,
  вариант меню, флаги футера, карт и CSS страницы во frontmatter;
- тело переносит как есть; экранирует фигурные скобки в тексте; ставит
  `is:inline` всем `<script>`, включая теги только с `src` (иначе Astro
  соберёт их как модуль); `<style>` в страницах нет;
- заменяет известные общие блоки (head, меню, футер, бейджи, маркеры) на
  компоненты; применяет `slash-prefix` один раз;
- страницы, где потребовалась ручная правка, перечислены в
  `scripts/migrate/manual.json` с причиной, чтобы переконвертация не стирала
  правку молча.

## 5. Карта замен `build-static.cjs`

| Сейчас | После релиза A |
| --- | --- |
| копирование `public/` в `dist/` | вывод Astro в `dist/`; `public/` только статика |
| маркеры и сниппеты head, бейджи, секции приложений | компоненты в layout и на страницах |
| Open Graph из title/description | `OpenGraph.astro` из props страницы |
| JSON-LD из конфига | `StructuredData.astro`: те же данные, полный граф на `/` и `/contacts/platforms/`, `Person` тренеров из коллекции |
| замена iframe карты | `MapRegion.astro` по `maps.config.json`; ключи страниц в прежней конвенции (`'/404.html'`, `'/contacts/platforms/'`) |
| скрипты карт и трафика | layout по props `hasMaps`, `trackViews` |
| `?v=ASSET_VERSION` для своих файлов | хэши Vite в `_astro/`; `?v=` остаётся только у бакетного `webflow.js` до релиза B |
| минификация CSS | Vite при импорте стилей; `klubnaya-karta.v1.css` импортируется на своей странице |
| `js/*-config.js` с подстановкой URL | эндпоинты `src/pages/js/*-config.js.ts` с теми же путями и содержимым `window.ZVENFIT_* = '…'`; `LEAD_API_URL` и остальные читаются при сборке как есть, без переименования |
| `maps-config.js` с `apiKey` | эндпоинт `js/maps-config.js.ts` из данных, снимка фото и `Y_MAPS_API_KEY` |
| strip GTM, `noindex`, `robots.txt` для staging | ветвление по `import.meta.env.MODE === 'staging'` в `Analytics.astro`, layout и `robots.txt.ts` |
| фото организаций с Яндекс Карт при сборке | prebuild-скрипт обновляет снимок `src/data/map-photos.json`; сборка сеть не трогает |
| `slash-prefix` | применяется конвертером, в сборке не нужен |
| ручной `sitemap.xml` | `src/pages/sitemap.xml.ts`: `<loc>https://zvenfit.ru/…/>` как сейчас, `lastmod` из frontmatter `updated` (стартовые значения из текущего файла), без `404` |
| `robots.txt` | `src/pages/robots.txt.ts`: production как сейчас, staging побайтно `User-agent: *\nDisallow: /\n` |

Релиз B: вендорные jQuery, `webflow.js`, `normalize.min.css`, `webflow.min.css`
переезжают в `src/vendor/`, подключаются через импорт `?url` и
`<script is:inline src>` / `<link>` в прежнем порядке (jQuery, затем
`webflow.js`); `ASSET_VERSION` исчезает из сборки и workflow.

## 6. Деплой и окружения

- `npm run build` = `astro build --mode ${NODE_ENV:-production}` с
  `ASTRO_TELEMETRY_DISABLED=1`. Режимы: `production`, `staging`,
  `development`; `.env.development` читается только в `development`.
  Переменные окружения не переименовываются.
- Порядок проходов `aws s3 sync` в `_deploy-environment.yml` и `deploy:yc`
  (решение 2026-10-19): (1) ассеты без `--delete`, `immutable`; (2) `robots.txt`
  и `sitemap.xml`, no-cache; (3) `*.html` и `js/*-config.js`, no-cache;
  (4) очистка `--delete` для ассетов. Если проверка этапа 0 покажет, что CDN
  кэширует HTML, проход 4 заменяется на удаление ассетов старше двух релизов
  по манифесту. Смена порядка делается в релизе B, когда появляются
  хэшированные имена; до него имена стабильны и `--delete` безопасен.
- Dev после релиза A: `npm run dev` = сборка функций + `mock-server` на :3000 +
  `astro dev --mode development --port 4173`. `watch-static.cjs` удаляется.
- Релизный конвейер не меняется: merge в `main` → staging → 7 тестов E2E →
  production → smoke. Для релизов A и B `skip_staging` не используется.

## 7. Этапы

### Этап 0. Решения, правило, инвентаризация

- Решения раздела 11 зафиксированы; ADR `knowledge-base/decisions/2026-10-astro-migration.md`
  с итогом каждого решения и ссылкой на этот план.
- `scripts/inventory-bucket.cjs`: все ссылки на `storage.yandexcloud.net/zvenfit/v2`
  из HTML, CSS, `scripts/*.json` и сниппетов с размерами (HEAD-запросы),
  группировкой по типу и пометкой, что остаётся в бакете (`documents/`).
- Проверки инфраструктуры, результат в `knowledge-base/`: кэширует ли CDN
  HTML и как его сбросить; включён ли versioning бакета; лицензия Roadrage
  для конвертации в WOFF2 (Roboto — Apache 2.0, вопросов нет).
- PR: правило в `AGENTS.md` (раздел 14), `docs/future/README.md`, добавление
  проекта в `repo-manifest.json.project_ids`, обновление `.cursor/rules/*`
  (они описывают `public/` как источник и плейсхолдеры `*-config.js`),
  карточка проекта в Workspace с зависимостью из PRJ-007.
- Заморозка: с открытия ветки A правки `public/` только как hotfix; каждый
  такой hotfix переконвертируется в ветке A (раздел 4, конвертер).

### Этап A1. Инструменты и проверки (в ветке A)

- Установить `astro`, `@astrojs/check`, `prettier-plugin-astro`,
  `eslint-plugin-astro`; `astro.config.mjs`, `tsconfig.json`, `.astro/` в
  `.gitignore`; `ASTRO_TELEMETRY_DISABLED=1` в скриптах `package.json`.
- Layout и компоненты раздела 4; `Base.astro` воспроизводит бакетные адреса
  `normalize.min.css`, `webflow.min.css`, jQuery и `webflow.js?v=ASSET_VERSION`
  как у legacy-страниц.
- Конвертер и `scripts/migrate/manual.json`.
- `scripts/compare-dist.cjs` (раздел 8) и его запуск в `quality.yml`.
- Проверки переписываются один раз: `check-build.cjs` теряет CDN-проверку
  `webflow.js` по `public/` и чтение `public/css`, получает проверку
  `data-wf-page`, дублей `id` и покрытия `w-node-*` по `dist/` (перенос из
  `check-webflow-layout.cjs`), проверку маркера `data-zvenfit-page` для
  отзывов (перенос из `webflow-layout.test.cjs`), наличие Метрики,
  Top.Mail.Ru, GTM, UTM и бикона на каждой production-странице кроме `404`,
  запрет атрибутов `data-astro-cid-*` и `astro-island`; проверки клубной
  карты и главной ищут хэшированные `_astro/` вместо `?v=`.
  `check-webflow-layout.cjs` и `webflow-layout.test.cjs` удаляются.
  `test:build` = `astro check` + `npm run build` + `check-build`;
  `test-staging-build.cjs` вызывает `astro build --mode staging`;
  `check-staging-build.cjs` без изменений по сути.
- `smoke-production.cjs` и его тест: `extractScriptUrl` принимает
  `/_astro/<имя>.<хэш>.js` для `lead-form.js`, `schedule.js`,
  `traffic-beacon.js`; конфиги по-прежнему `/js/*-config.js`.
- ESLint: `src/**/*.{js,ts,astro}`, overrides `max-lines` на новые пути,
  `import/no-default-export` выключен для `astro.config.mjs`; `npm run lint`
  перестаёт ссылаться на `public/js`. `project-checks.json`: `layout`
  заменяется на `parity`, остальные команды сохраняют имена; новые
  npm-скрипты не попадают под маску из `deploy-lead-intake.test.cjs`.
- Готово, когда: пустой проект собирается в трёх режимах, `test:build` и
  `test:build:staging` зелёные на одной сконвертированной юридической
  странице, compare-dist по ней чист.

### Этап A2. Конвертация всех страниц и коллекция тренеров

- Конвертер прогоняется по 41 файлу; ручные правки фиксируются в
  `manual.json`; каждая страница проходит компилятор Astro.
- Коллекция `trainers`: `slug`, `wfPage`, `name`, `nameDative`, `role`,
  `photoClass`, `groups: [{ heading, itemsHtml[] }]`, `certificates?:
  [{ title, href }]`, `certificatesSectionEmpty?: boolean`, `nextSlug`,
  `location`, `meta: { title, description }`, `fitbaseTrainerId?`. Одна
  схема и один шаблон `trenery/[slug].astro` на все 21 страницу, спецшаблонов
  ноль; `StructuredData.astro` берёт `Person` из коллекции, блок `trainers`
  конфига удаляется.
- `src/scripts/*` подключаются через Vite как модули по чек-листу: нет
  присваиваний необъявленным переменным, нет `this` на верхнем уровне,
  глобали только через `window.ZVENFIT_*`. Эндпоинты конфигов, `sitemap.xml.ts`,
  `robots.txt.ts`, снимок фото карт.
- `build-static.cjs`, `watch-static.cjs`, сниппеты, `public/*.html`,
  `public/css`, `public/js`, `public/sitemap.xml`, `public/robots.txt`
  удаляются; конфиги в `src/data/`.
- Готово, когда: compare-dist чист по всем 41 страницам (allow-list только из
  раздела 2), `test:build`, `test:build:staging`, `test:scripts`, `lint`
  зелёные, `dist/` не содержит `data-astro-cid-*`.

### Этап A3. Гейт и релиз A

- Pre-merge гейт (раздел 8) пройден, отчёт локального прогона автотестов
  приложен к PR. Документация обновлена: README (быстрый старт, архитектура,
  где менять код), `AGENTS.md` (раздел 14), `knowledge-base/_index.md`,
  `knowledge-base/site-information-architecture.md`, `TODO.md` (закрыт
  «Auto-generate sitemap»), `.cursor/rules/*`.
- Merge → релиз. После релиза: сверка Метрики за первые сутки с предыдущей
  неделей (раздел 13), проверка CI автотестов и ежедневного production-smoke
  в `zvenfit-autotests`.
- Следом отдельные PR: пункт 6 (H1 и title тренеров в одном шаблоне), пункт 8
  (H1 главной), пункт 11 (уровни заголовков).

### Этап B1. Подготовка автотестов

Делается в `zvenfit-autotests` до релиза B, по правилу «сначала autotests,
потом SHA в этом репозитории».

- `tests/support/network.ts` блокирует вендорные ресурсы по basename в
  `/_astro/` (`jquery`, `webflow`, `normalize`, `webflow.min`, шрифты) в
  дополнение к хосту бакета; `zvenfit.webflow.min.css` сегодня не блокируется
  и в список не попадает. Проверка локально через `ZVENFIT_FRONTEND_PATH` на
  сборку ветки B; настоящая проверка — staging-гейт релиза B.
- Пин нового SHA в `main.yml` и `staging.yml` отдельным PR здесь.

### Этап B2. Ассеты и кэш, релиз B (пункты 2 и 4 ревью)

- `scripts/optimize-images.cjs` на sharp: из оригиналов по инвентаризации
  генерирует WebP нужных ширин по фактической ширине карточек в
  `src/assets/images/`; CSS переписывается на локальные пути через Vite;
  `image-set()` там, где нужен fallback. В репозиторий коммитятся только
  оптимизированные файлы, оригиналы остаются в бакете как архив.
- Roadrage в WOFF2 с `font-display`, Roboto самохостинг вместо
  `fonts.bunny.net`; вендорные CSS/JS в `src/vendor/` через `?url`;
  `ASSET_VERSION` удаляется из сборки, workflow и `deploy-lead-intake.test.cjs`.
- `og:image`, SVG-бейджи, пины карт и фото локаций из конфигов переезжают в
  `src/assets/`; favicon и webclip в `public/` под новыми именами с версией,
  потому что они не хэшируются и попадают под `immutable`.
- Сертификаты тренеров остаются в бакете (решение 2026-10-19): им выставляется
  `Cache-Control` отдельно, `check-build` разрешает ссылки на
  `zvenfit/v2/documents/` и запрещает остальные.
- Порядок проходов деплоя из раздела 6; `robots.txt` без `/js/` и `/css/`
  уходит в пункт 7 ревью вместе с `Host` и `Crawl-delay`.
- Готово, когда: главная на телефоне ≤ 1,5 МБ (замер до и после в карточку
  проекта), в `dist/` нет ссылок на бакет кроме `documents/`, pre-merge гейт
  пройден с новым SHA автотестов, релиз прошёл staging и E2E.

### После миграции, в рамках PRJ-007 и TODO

- Пункт 5: цели из кода, GTM убирается в `Analytics.astro`.
- Пункт 10: отказ от `webflow.js` и jQuery, свои выпадашки, слайдеры, табы;
  обновление пяти файлов автотестов с Webflow-классами.
- Пункт 3: вид расписания на телефоне, при необходимости островок.
- TODO «Footer duplication» и «Navigation hierarchy»: один футер и одно меню.
- Ревизия клиентских скриптов. По ощущению владельца (2026-10-12) в
  2,5 тысячах строк много лишнего. Замер реально выполняемого кода (Coverage
  в DevTools на staging и прогон E2E), удаление мёртвых веток и дублей, затем
  перевод оставшегося на TypeScript по порядку из раздела 4.

## 8. Паритет и pre-merge гейт

`scripts/compare-dist.cjs` сравнивает `dist/` базовой ветки (legacy-сборка
`main` в `git worktree`, те же переменные окружения, снимок фото карт) и
`dist/` ветки по всем 41 страницам. Сравниваются:

- `<title>`, все `<meta>` и `<link>` в `<head>` (description, canonical,
  robots, Open Graph, Twitter, referrer, preconnect, favicon);
- JSON-LD как разобранный JSON; inline-скрипты после нормализации пробелов;
- `data-wf-page`, `data-wf-site`, `lang`;
- последовательность заголовков с текстом; список `id` с дублями; все `href`
  внутренних и внешних ссылок; `src`/`href` скриптов и стилей без хэшей и
  `?v=`; видимый текст с нормализованными пробелами;
- `sitemap.xml` и `robots.txt` целиком.

Исключения по умолчанию: порядок атрибутов, хэши и `?v=` в адресах
ресурсов, пробелы между тегами, `defer` у `webflow.js` на `/offer/`. Другие
расхождения только по явному allow-list в PR. В `quality.yml` для базы нужен
`fetch-depth: 0` и `github.base_ref`; после релиза A job сравнивает
`dist/` целиком по allow-list (релиз B), затем удаляется.

Pre-merge гейт для PR A и B, выполняет агент и прикладывает отчёт к PR:

1. `npm run lint`, `npm run test:scripts`, `npm run test:build`,
   `npm run test:build:staging`, compare-dist без расхождений вне allow-list.
2. Полный набор автотестов локально против сборки ветки:
   в `zvenfit-autotests` на SHA, запиненном в `main.yml`,
   `ZVENFIT_FRONTEND_PATH=<checkout ветки> npm run check` (typecheck и все
   спеки; сборка ветки сделана с `NODE_ENV=development`).
3. `quality` и CodeQL зелёные.

Staging и 7 тестов E2E после merge — релизный гейт, а не критерий готовности.

## 9. Откат и остановка

- Откат релиза A или B — revert PR, это полный релиз через staging и E2E,
  около 10 минут. Перед релизом B очистка ассетов (проход 4) выключена на
  первый прогон, чтобы откат не ссылался на удалённые файлы; включается
  следующим релизом.
- Условие остановки ветки A: страница, которую не удаётся привести к паритету
  за разумное время, не «оставляется в legacy» (двойной сборки больше нет), а
  блокирует релиз; решение владельца: ждать, принять отклонение в allow-list
  или откатить ветку.
- Если релиз A упал на staging E2E: fix-forward в той же ветке, если причина
  понятна за час, иначе revert. `skip_staging` для A и B запрещён.
- Бакет: versioning и CDN-сброс проверены на этапе 0; оригиналы ассетов не
  удаляются до отдельного решения после релиза B.

## 10. Риски

| Риск | Мера |
| --- | --- |
| Компилятор Astro 7 падает на невалидном HTML экспорта | конвертер прогоняет страницу через компилятор; правки фиксируются в `manual.json` |
| `compressHTML: 'jsx'` ломает inline-раскладку | `compressHTML: false` навсегда |
| Vite инлайнит мелкие скрипты и CSS | `assetsInlineLimit: 0`, `inlineStylesheets: 'never'` |
| Фигурные скобки и `<script src>` без `is:inline` | конвертер экранирует и ставит директиву всем скриптам |
| `webflow.js` и интеракции зависят от `data-wf-page`, `data-wf-site`, `w-node-*` | атрибуты в props layout и в коллекции тренеров; проверка в `check-build` |
| jQuery и `webflow.js` перестают быть глобальными при бандлинге | только `?url` и `<script is:inline src>`, порядок jQuery → `webflow.js` |
| Порядок CSS: normalize → webflow → zvenfit → страница | явный порядок в `Base.astro`, проверка в compare-dist |
| Smoke после деплоя ищет жёсткие пути скриптов | адаптация в A1, конфиги на прежних путях |
| Тихая потеря аналитики на перенесённой странице | проверка наличия счётчиков в `check-build`, сверка Метрики после релиза |
| Длинная ветка A и правки `public/` на `main` | заморозка с этапа 0, hotfix переконвертируется детерминированным конвертером |
| E2E меняют условия, когда вендорные ассеты уходят с бакета | этап B1 до релиза B, пин SHA |
| `s3 sync --delete` удаляет старые ассеты раньше HTML | новый порядок проходов в релизе B, проверка CDN на этапе 0 |
| Favicon и webclip под `immutable` без хэша | версия в имени файла |
| Персональные данные в публичном репозитории | сертификаты остаются в бакете; `secret_scan.py` и просмотр партии перед коммитом |
| Рост зависимостей, sharp с нативными бинарниками | `npm ci` в CI, Dependabot version updates, CodeQL без изменений |
| CI автотестов собирает фронтенд сам | после релиза A проверить их `quality` и `production-smoke` |

## 11. Решения

Приняты владельцем 2026-10-19:

- **R1. Идём в миграцию**, план исполняется с этапа 0.
- **R2. Два релиза**: A — сборка и страницы, B — ассеты. Инкрементальный путь
  отвергнут.
- **R3. Конфиги API** — эндпоинты на прежних путях `/js/*-config.js` плюс
  no-cache правило в деплое.
- **R4. Сертификаты и дипломы тренеров** остаются в бакете.
- **R5. Картинки, шрифты и вендорные файлы** — оптимизированные в
  репозиторий, оригиналы в бакете как архив.
- **R6. Строгий паритет** в релизе A, пункты 6, 8, 11 отдельными PR после.
- **R7. Деплой**: ассеты без `--delete` → HTML → очистка; при CDN-кэше HTML —
  хранение двух релизов.
- **R8. Гейт E2E**: полный набор локально до merge, 7 тестов в релизе.

По умолчанию, пересматриваются по запросу:

- Dependabot version updates включаются для корневого `package.json` и
  функций, еженедельно, с группировкой minor и patch; security-алерты уже
  включены (см. `TODO.md`).
- Фото организаций с Яндекс Карт — снимок в `src/data/`, обновление скриптом.
- Островки на клиентском фреймворке — не в миграции, решение при пункте 3.
- Текст правила `AGENTS.md` — раздел 14.

Открытые, вне этого плана: дата открытия ветки A и окно заморозки; пункты 3,
5 и 13 PRJ-007 (вид расписания, правит ли кто-то GTM без разработчика,
юрист по согласию).

## 12. Не входит

Редизайн, чистка Webflow CSS, ревизия и перевод существующих скриптов на
TypeScript (итерация после миграции), изменение текстов и цен, отказ от
рантайма Webflow, GTM, юридические вопросы, настройки CDN и редиректов
(пункты 7 и 9 ревью идут независимо, кроме проверки кэша HTML на этапе 0).

## 13. Метрики результата

- Правка футера или меню: один файл вместо 18 или 40.
- Новый тренер: один JSON, ноль HTML; H1 и title тренеров: один шаблон.
- Главная на телефоне ≤ 1,5 МБ после релиза B; LCP на телефоне для `/` и
  `/klubnaya-karta/` до и после каждого релиза.
- Просмотры в Метрике и Top.Mail.Ru за сутки после каждого релиза не ниже
  медианы предыдущей недели с поправкой на день недели: детектор тихой потери
  аналитики.
- Покрытие индекса в Вебмастере и Search Console без выпадений через две
  недели после релиза A.
- Ссылок на бакет в `dist/`: ноль, кроме `documents/`.
- Время сборки в CI и локально, для сравнения с 2026-10-19.

## 14. Оценка и документация

Рабочие дни агентной разработки с ревью владельца, без ожиданий релизов;
независимое ревью советовало закладывать 20–30 % сверху, поправка включена:

| Этап | Оценка |
| --- | --- |
| 0. Решения, инвентаризация, проверки инфраструктуры, ADR, карточка | 1–2 |
| A1. Инструменты, конвертер, переписанные проверки | 3–4 |
| A2. Конвертация 41 страницы, коллекция тренеров, паритет | 4–6 |
| A3. Гейт, документация, релиз A | 1–2 |
| Довески после A (пункты 6, 8, 11) | 1–2 |
| B1. Автотесты и пин SHA | 1–2 |
| B2. Ассеты, деплой, релиз B | 3–5 |

Текст правила для `AGENTS.md` после этапа 0 (до релиза A вместе с ним
действует прежнее правило с пометкой о ветке A):

> Фронтенд собирается Astro в статический `dist/`; страницы живут в
> `src/pages`, общая разметка в `src/layouts` и `src/components`, данные в
> `src/content` и `src/data`, статика как есть в `public/`. Клиентский
> фреймворк на страницах не используется; островок допустим для отдельного
> виджета с обоснованием в PR. Не предполагать React или Next.

Маршрутизация знаний: этот файл — техническая часть (решение, инварианты,
структура, карта замен, деплой, паритет, риски); после merge PR этапа 0 он
переезжает в `docs/astro-migration.md`. Статус этапов и решения ведутся в
карточке проекта Workspace, итоги решений — в ADR в `knowledge-base/decisions/`,
со взаимными ссылками и без дублирования текста.
