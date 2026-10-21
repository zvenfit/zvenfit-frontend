# План миграции фронтенда на Astro

Редакция 4 от 2026-10-21. История: черновик 2026-10-04, редакция 2 после
собственного ревью 2026-10-05, раздел TypeScript 2026-10-12, независимое ревью
двух рецензентов 2026-10-12, решения владельца R1–R8 и редакция 3 2026-10-19,
второе независимое ревью трёх рецензентов (техническое, процессное и сухой
прогон релиза A) 2026-10-20, решения R9–R12 и редакция 4 2026-10-21.
До merge PR этапа 0 файл остаётся в `docs/future/`; статус этапов ведётся в
карточке проекта Workspace, здесь только техническая часть.

Связанные записи: [`TODO.md`](../../TODO.md) («Footer duplication» отложен «до
перехода на шаблонизатор», «Auto-generate sitemap», «Navigation hierarchy»),
правило о стеке в [`AGENTS.md`](../../AGENTS.md), пункты 1, 2, 4, 5, 6, 7, 8,
10 и 11 ревью фронтенда 2026-09-30 (карточка PRJ-007).

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

**Форма миграции: два релиза.** Релиз A переводит сборку и все 41 страницу
разом в одной ветке и сразу выводит legacy-сборку; релиз B переносит ассеты.
Инкрементальный путь с двойной сборкой отвергнут 2026-10-19: все блокеры
первого независимого ревью сидели в переходной механике.

Проверено 2026-10-20: Astro 7.4.1 требует Node ≥ 22.22 (последний Node 22 —
22.23.3; CI обоих репозиториев берёт `node-version: '22'`, что без
`check-latest: true` может дать более старый 22.x из кэша раннера; локально
24). Компилятор Astro 7 строже к невалидному HTML; `compressHTML` по
умолчанию `'jsx'` и убирает пробелы и переводы строк между элементами на
разных строках; Astro инлайнит обработанные скрипты меньше порога
`assetsInlineLimit`, Vite инлайнит мелкие CSS и `?url`-ассеты. Всё закрыто
настройками раздела 4.

## 2. Инварианты

Что не меняется в релизах A и B:

- URL всех 40 страниц и `404.html`, завершающий слэш, `index.html` в каталогах
  (`build.format: 'directory'`, `trailingSlash: 'always'`).
- `dist/` как единственный артефакт и Object Storage как хостинг. HTML,
  `robots.txt`, `sitemap.xml` без кэша, хэшированные ассеты `immutable`.
- Cloud Functions, API Gateway staging, Basic auth, релизный конвейер
  staging → E2E → production, владение E2E у `zvenfit-autotests`.
- Фирменный стиль; `zvenfit.webflow.css` остаётся глобальной таблицей;
  `webflow.js` и jQuery остаются до пункта 10 ревью.
- На production: аналитика, GTM и UTM. На staging: их отсутствие, `noindex`,
  API через same-origin gateway, `robots.txt` побайтно
  `User-agent: *\nDisallow: /\n`. На development (CI автотестов, `npm run
  dev`): аналитики нет, это осознанное отклонение от сегодняшней сборки, UTM и
  бикон есть, `noindex` нет, `site` всегда `https://zvenfit.ru`.
- **Строгий паритет в релизе A.** Разметка, тексты, ссылки, meta, JSON-LD,
  inline-скрипты и атрибуты `data-wf-*`/`w-node-*` не меняются. Единственное
  согласованное отклонение: `public/offer/index.html` подключает `webflow.js`
  без `defer`, общий layout выровняет его с остальными. H1 тренеров, H1
  главной, уровни заголовков (пункты 6, 8, 11), GTM, отказ от рантайма
  Webflow, унификация меню и футеров идут отдельными PR после релиза A.

Что меняется и записано как изменение, а не инвариант: правила деплоя
(раздел 6): `js/*-config.js` переходят из `immutable` в no-cache, порядок
проходов `aws s3 sync` меняется уже в релизе A.

## 3. Факты, от которых отталкивается план

Снято с репозитория 2026-10-04 … 2026-10-20; числа считаются по 41 файлу,
если не сказано иное.

### Страницы и общие блоки

- 40 `index.html` плюс `404.html`, 827 KB исходного HTML. Меню: `menu1` на
  главной, `menu2` на 9 страницах услуг, `menu3` на 9 страницах и `404`,
  `menu2-coach` на 21 странице тренеров. 35 страниц несут `data-wf-page` и
  `data-wf-site` на `<html>`, 34 — комментарий Webflow «Last Published».
  Общая часть `<head>` после нормализации почти везде одинакова, но живёт в
  41 копии; содержательно отличаются главная, клубная карта и `404`. Четыре
  страницы несут `data-zvenfit-page` (`club-card`, `group-fitness`, `gym`,
  `mini-groups`), на него опираются проверки и CSS.
- Футер есть на 18 страницах. На 14 это Webflow-пара `section-4` (десктоп) и
  `section-3` (мобильный) с разделителем и iframe карты. Главная,
  `/contacts/platforms/` и `404.html` несут эту же пару плюс новый блок
  `footer-grid`/`footer-locations`. У `/raspisanie/` есть `section-4` и
  `footer-grid`, но нет `section-3` и карты. 23 страницы без футера: все 21
  тренер, `/promos/` и `/promos/apps/`.
- Страницы тренеров. Общий скелет у всех: `menu2-coach` → фото с
  модификатором класса (у одной страницы без модификатора) → карточка с
  именем (`h2.heading-page`) и ролью (`h3.text-block`) → разделитель →
  карточка со списками (`ul.list`, заголовки `li.heading-3`, десять
  вариантов текста и регистра) → разделитель. У 8 страниц дальше идёт
  `section-2` «Сертификаты» с карточками `cat_card areas` (34 ссылки на
  `documents/` в бакете у 7 тренеров, одна из них PDF; у одной страницы
  `section-2` пустой). В конце ссылка на следующего тренера
  (`link-block-page4`; цепочки образуют три цикла на 14, 5 и 2 страницы) и
  кнопка «записаться к …» с именем в дательном падеже. На каждой странице 6
  `id="w-node-…"`, суффикс равен последним 8 hex `data-wf-page`;
  `zvenfit.webflow.css` содержит правила для этих id (раскладка грида).
  Слайдеров на страницах тренеров нет: `w-slider` живёт на 8 страницах услуг
  и главной. JSON-LD `Person` и хлебные крошки строятся из блока `trainers`
  в `structured-data.config.json` на 21 запись с полями `name`, `jobTitle`,
  `location`.
- Интерактив Webflow: выпадашки на 15 страницах, слайдеры на 9, табы на 3,
  интеракции `data-w-id` на 30. `coaches-show-more.js` подключён только на
  `/gruppovye-trenirovki/`. На странице формы 4 inline-скрипта и 5 внешних:
  jQuery и `webflow.js`, маска телефона `imask` с `unpkg.com` (пункт 1 ревью
  PRJ-007), `lead-config.js`, `lead-form.js`.

### Сборка и проверки

- `build-static.cjs` (1027 строк): минификация CSS и удаление локального
  `webflow.js` до цикла; на каждую страницу: strip GTM на staging → замена
  iframe карты на регион из `maps.config.json` → сниппеты head (аналитика
  кроме staging, UTM) → Open Graph из title и description → JSON-LD из
  `structured-data.config.json` (полный граф на `/` и `/contacts/platforms/`,
  `Person` для 21 тренера) → бейджи приложений (без футерного блока на
  `/contacts/platforms/` и `/promos/apps/`) → скрипты карт → трафик-бикон
  (кроме 404) → `noindex` на staging → класс `slash-prefix` → cache-bust
  `?v=ASSET_VERSION`. После цикла: `robots.txt` для staging, подстановка
  `LEAD_API_URL`, `SCHEDULE_API_URL`, `TRAFFIC_API_URL` в `js/*-config.js` (в
  development пустые значения заменяются на `http://localhost:3000`,
  `…/schedule`, `…/traffic`), запись `maps-config.js` с `apiKey` из
  `Y_MAPS_API_KEY`, фото организаций с Яндекс Карт по сети с fallback.
- `check-build.cjs` делает 33 проверки: `dist/index.html`, `maps-config.js`
  без плейсхолдера и с `window.ZVENFIT_MAPS` (исполняется в `vm`), CDN-адрес
  `webflow.js` на каждой странице из `public/` (и падение, если таких страниц
  ноль), форма (дубли `id`, `method="post"`, нативный select, `role="alert"`),
  клубная карта (дубли `id`, canonical, `?v=` у CSS и скриптов,
  `data-map-set`, ≥ 8 CTA, `main#main-content`, `#contacts`, стили со scope по
  `data-zvenfit-page`), ссылка «Самостоятельно» в тренажёрном зале, логотип
  512×512, трафик-скрипты на главной, `404` без бикона, логотип в JSON-LD,
  SVG-шеврон нативного select и `prefers-reduced-motion` точными строками в
  `public/css/zvenfit.webflow.css`.
- `webflow-layout.test.cjs` требует `checkedPages > 0` и читает две страницы из
  `public/` на уровне модуля; входит в `test:scripts` и `test:layout`.
  `check-staging-build.cjs` проверяет `noindex`, отсутствие аналитики,
  байт-в-байт `robots.txt` и staging-адреса в `dist/js/*-config.js`.
  `test:build` и `test-staging-build.cjs` вызывают `build-static.cjs`
  напрямую; `test-staging-build.cjs` сам задаёт `NODE_ENV`, адреса и
  `ASSET_VERSION`, потому что деплой вызывает его без окружения.
- `smoke-production.cjs` запускается в деплое после заливки и на staging, и
  на production: ищет на форме `<script src="…/js/lead-form.js">`,
  `/js/traffic-beacon.js`, `/js/lead-config.js`, `/js/traffic-config.js`, на
  расписании `/js/schedule.js` и `/js/schedule-config.js`, скачивает конфиги
  и читает `window.ZVENFIT_*`. Регулярка требует литерал `/js/<имя>`, query
  необязателен.
- `deploy-lead-intake.test.cjs` требует `ASSET_VERSION: ${{ github.run_number }}`
  в `_deploy-environment.yml`, **ровно три** команды `aws s3 sync`,
  `timeout-minutes ≤ 20` у каждого job, job `quality` без `name:` и `paths:`,
  и запрещает npm-скрипты по маскам `playwright|e2e` (имя) и
  `playwright|tests?[:/]e2e|tests?[:/]staging` (команда).
- Деплой (`_deploy-environment.yml`, то же в `deploy:yc`): три прохода
  `aws s3 sync --delete`: (1) всё кроме `*.html`, `robots.txt`, `sitemap.xml` с
  `immutable`; (2) `robots.txt` и `sitemap.xml` no-cache; (3) `*.html`
  no-cache. Конфиги `js/*-config.js` сегодня уходят с `immutable` и живут
  только благодаря `?v=`. Повторный проход по тому же пути с другим
  `Cache-Control` файл не перезаливает: `sync` сравнивает размер и время.
- Окружение: workflow передаёт `NODE_ENV` (`staging`/`production`),
  `LEAD_API_URL`, `SCHEDULE_API_URL`, `TRAFFIC_API_URL`, `Y_MAPS_API_KEY`,
  `ASSET_VERSION`; CI автотестов и `npm run dev` используют
  `NODE_ENV=development`. Astro режимы задаются `--mode`; `.env.<mode>`
  читается по режиму, `.env` и `.env.local` всегда; экспортированный
  `NODE_ENV` просачивается в Vite и делает `import.meta.env.PROD` ложным при
  `staging`.
- Корневого `tsconfig.json` нет; `.astro/` не в `.gitignore`; ESLint линтит
  `public/js/**/*.js` как модули, `max-lines` 300 для всех файлов с
  исключением для `schedule.js` и `yandex-map.js`, `plugin:prettier/recommended`,
  `import/no-default-export`, override для `*.ts` с `parserOptions.project`
  только из tsconfig функций; Prettier без плагина для `.astro`. 10 страниц
  длиннее 300 строк. Репозиторий на GitHub публичный.

### Ассеты

- В бакете `zvenfit/v2` по данным ревью 2026-09-30 122 файла без
  `Cache-Control`; листинг закрыт, размер неизвестен. Из репозитория
  ссылаются 132 уникальных URL: 81 фон в `zvenfit.webflow.css` (из них 47
  фото тренеров в `images/coaches/`), 8 в `klubnaya-karta.v1.css`, favicon и
  webclip в `<link>`, сертификаты в `<a href>`, `og:image` из конфига
  (`webclip.png`) и собственный `og:image` клубной карты, три SVG-бейджа из
  `app-links.config.json`, два пина и 8 фото локаций из `maps.config.json`,
  вендорные файлы и шрифт. На всём сайте один тег `<img>`. По уникальным
  файлам: JPEG 63, WebP 37, PNG 16, SVG 10, GIF 1. Вывод: компонент `<Image>`
  Astro почти не применим, выигрыш по весу даёт скрипт на sharp с
  переписыванием CSS.
- Шрифты: Roadrage как `roadrage.ttf` из бакета через `@font-face`; Roboto и
  Roboto Condensed через `@import` с `fonts.bunny.net`. Вендорные файлы из
  бакета: `normalize.min.css`, `webflow.min.css`, `jquery-3.5.1.min.js`,
  `webflow.js?v=`; с `unpkg.com` — `imask`.
- `robots.txt` запрещает `/js/` и `/css/`; уже после релиза A под `/js/`
  остаются только конфиги, стили и скрипты лежат в `/_astro/` (пункт 7 ревью).

### Скрипты

- 2546 строк: `schedule.js` 1272, `yandex-map.js` 768, `utm-attribution.js`
  230, `lead-form.js` 194, остальное мелочь. Четыре файла обёрнуты в IIFE,
  три выполняются на верхнем уровне. Общих переменных между файлами нет,
  только `window.ZVENFIT_LEAD_API`, `window.ZVENFIT_SCHEDULE_API`,
  `window.ZVENFIT_TRAFFIC_API` и `window.ZVENFIT_MAPS`. `traffic-beacon.js`
  читает свой конфиг сразу при выполнении, остальные лениво: порядок
  «конфиг раньше потребителя» обязателен.
- jQuery в нашем коде не используется, только рантаймом Webflow. `webflow.js`
  требует глобальный jQuery, загруженный раньше классическим скриптом.
- Имена чанков Astro для обработанных `<script>` берутся из компонента, а не
  из basename файла; basename сохраняют только `?url`-ассеты
  (`_astro/[name].[hash][extname]`).

### Автотесты

- 12 спек, 11 вызовов `blockNonEssentialResources` в 10 файлах: 6 с
  настройками по умолчанию, 5 с `allowLayoutResources`, из них 4 ещё и с
  `allowRuntimeResources`. Хелпер режет `image` и `media` всегда, остальное
  не с origin сайта блокирует и по флагам пропускает CSS и шрифты с хоста
  бакета и `fonts.bunny.net` и `js/` с хоста бакета. Same-origin запросы
  других типов проходят всегда. Пока вендорные CSS/JS и шрифты остаются в
  бакете (до релиза B), условия тестов не меняются.
- Стабы `tests/support/api-stubs.ts` перехватывают `**/js/lead-config.js*` и
  `**/js/schedule-config.js*`; `traffic-config.js` не стабится.
- Webflow-классы в локаторах: `.w-dropdown-list`, `.w-dropdown-toggle`,
  `.w-slider`, `.section-3`, `.section-4`, `.div-block-6` в пяти файлах;
  маршруты берутся из `dist/sitemap.xml` (`<loc>https://zvenfit.ru/…`).
- CI автотестов (`quality.yml`, ежедневный `production-smoke.yml`) чекаутит
  `zvenfit-frontend@main`, `npm ci`, `NODE_ENV=development npm run build` на
  `node-version: '22'`, затем раздаёт `dist/`. Локальный прогон:
  `ZVENFIT_FRONTEND_PATH=<checkout> npm run check` в `zvenfit-autotests`
  (`tsc --noEmit` и все спеки кроме `staging/**`), статический сервер отдаёт
  `<checkout>/dist`, ничего не собирает.
- Релизный E2E на staging это `tests/staging/staging.spec.ts`, 8 тестов, с
  Basic auth и настоящими конфигами. Environment staging разрешает деплой
  только из `main`: прогнать ветку на staging до merge нельзя.
- Состояние на 2026-10-20: gateway staging теряет около половины
  TCP-соединений на уровне handshake, приложение при установленном
  соединении отвечает нормально. Релиз #79 (14 октября) упал на staging-smoke
  с `fetch failed`, production выкачен вручную с `skip_staging`, релиз #80
  отменён и не выкачен; production на #79, `main` на #80, последний зелёный
  staging E2E 5 октября. Восстановление staging — отдельная задача вне плана
  и условие входа в ветку A (этап 0).

## 4. Целевая структура

```
astro.config.mjs            site 'https://zvenfit.ru', trailingSlash 'always',
                            compressHTML false, build.inlineStylesheets 'never',
                            vite.build.assetsInlineLimit 0
tsconfig.json               extends astro/tsconfigs/strict
src/
  layouts/Base.astro        <html lang data-wf-page data-wf-site data-zvenfit-page>,
                            head, CSS, скрипты
  components/
    Menu.astro              variant: home | service | coach | plain  (menu1/2/2-coach/3)
    Footer.astro            Webflow-пара section-4/section-3 с MapRegion;
                            флаги withGrid, withMobile, withMap
    MapRegion.astro         регион карты из maps.config.json (замена iframe)
    Analytics.astro         VK + Метрика + GTM (до пункта 5), только mode production
    UtmHead.astro           снипет UTM
    OpenGraph.astro         из title/description/og:image страницы
    StructuredData.astro    из structured-data.config.json и коллекции тренеров
    AppDownloadBadges.astro, AppDownloadPlatforms.astro, AppDownloadPromo.astro
    TrafficBeacon.astro
  pages/                    40 страниц, 404.astro, sitemap.xml.ts, robots.txt.ts,
                            js/lead-config.js.ts, js/schedule-config.js.ts,
                            js/traffic-config.js.ts, js/maps-config.js.ts
    trenery/[slug].astro    из коллекции
  content.config.ts         коллекция trainers (zod из astro/zod, раздел 7, A2)
  content/trainers/*.json   21 запись
  data/                     app-links, maps, structured-data, map-photos snapshot
  scripts/                  schedule.js, lead-form.js, yandex-map.js, utm, beacon,
                            coaches-show-more.js, accordion-horizontal.js:
                            классические скрипты через импорт ?url (релиз A)
  vendor/                   imask (релиз A, после пункта 1 PRJ-007); jquery,
                            webflow.js, normalize.min.css, webflow.min.css (релиз B)
  styles/                   zvenfit.webflow.css, klubnaya-karta.v1.css, fonts.css
  assets/ (релиз B)         images/, fonts/
public/                     только статика как есть: favicon, webclip, images/*.svg
scripts/migrate/html-to-astro.cjs   одноразовый конвертер, удаляется после релиза A
scripts/migrate/manual.json         страницы с ручными правками и причины
scripts/compare-dist.cjs            проверка паритета (остаётся как инструмент)
scripts/inventory-bucket.cjs        инвентаризация бакета (этап 0)
scripts/optimize-images.cjs         sharp-конвейер (релиз B)
scripts/snapshot-bucket.sh          снимок бакета перед релизом A (этап 0)
```

Конфиги `scripts/*.config.json` переезжают в `src/data/` в релизе A; блок
`trainers` из `structured-data.config.json` уходит в коллекцию.

### Скрипты в релизе A: классические, через `?url`

Существующие семь скриптов в релизе A не становятся модулями. Они лежат в
`src/scripts/`, импортируются как `?url` и подключаются
`<script is:inline src={url} defer>`: имя файла сохраняется в
`_astro/lead-form.<хэш>.js`, семантика не меняется (без strict mode, порядок
как сейчас), smoke находит их по basename, хэш даёт `immutable`. Перевод в
модули и TypeScript — отдельная итерация после миграции.

### TypeScript

- Astro компилирует frontmatter `.astro`-файлов как TypeScript.
  `tsconfig.json` расширяет `astro/tsconfigs/strict`; `@astrojs/check` и
  существующий `typescript` 5.x в devDependencies; `astro check` в
  `quality.yml` с этапа A1: типы компонентов, props и схем коллекций.
- Схема коллекции тренеров на zod (`import { z } from 'astro/zod'`) даёт
  типы данных без ручного описания; ошибка в JSON-записи ломает сборку.
- Эндпоинты и новые клиентские скрипты пишутся сразу на TypeScript.
- Перевод существующих скриптов на модули и `.ts` — отдельная итерация после
  миграции вместе с их ревизией (раздел «После миграции»). Порядок: сначала
  `// @ts-check` с JSDoc, потом модули, потом `.ts` файл за файлом; поведение
  не меняется, проверка — те же E2E.
- Общие типы контрактов API между функциями и скриптами сайта — кандидат для
  общего пакета по PRJ-009, в миграцию не входит.

### Конвертер

`scripts/migrate/html-to-astro.cjs` детерминирован: та же страница на входе
даёт тот же `.astro` на выходе. Читает исходник по git-ссылке
(`--ref main`), а не только из рабочего дерева, потому что после A2 в ветке
`public/` страниц нет. Что делает:

- вынимает title, description, canonical, `og:image` страницы (у клубной карты
  свой), `data-wf-page`, `data-wf-site`, `data-zvenfit-page`, вариант меню,
  флаги футера, карт и CSS страницы, дату `updated` для sitemap во
  frontmatter;
- тело переносит как есть; экранирует фигурные скобки в тексте; ставит
  `is:inline` всем `<script>`, включая теги только с `src` (иначе Astro
  соберёт их как модуль); `<style>` в страницах нет;
- заменяет известные общие блоки (head, меню, футер, бейджи, маркеры) на
  компоненты; применяет `slash-prefix` один раз;
- для страниц из `scripts/migrate/manual.json` завершается ненулевым кодом с
  причиной; перезапись только с `--force`, после чего ручная правка
  переносится заново и фиксируется в том же файле.

## 5. Карта замен `build-static.cjs`

| Сейчас | После релиза A |
| --- | --- |
| копирование `public/` в `dist/` | вывод Astro в `dist/`; `public/` только статика |
| маркеры и сниппеты head, бейджи, секции приложений | компоненты в layout и на страницах |
| Open Graph из title/description | `OpenGraph.astro` из props страницы |
| JSON-LD из конфига | `StructuredData.astro`: те же данные, полный граф на `/` и `/contacts/platforms/`, `Person` 21 тренера из коллекции |
| замена iframe карты | `MapRegion.astro` по `maps.config.json`; ключи страниц в прежней конвенции (`'/404.html'`, `'/contacts/platforms/'`) |
| скрипты карт и трафика | layout по props `hasMaps`, `trackViews`; `traffic-config.js` всегда раньше бикона |
| `?v=ASSET_VERSION` для своих файлов | хэши в `_astro/` через `?url`; `?v=` остаётся только у бакетного `webflow.js` до релиза B |
| минификация CSS | Vite при импорте стилей; `klubnaya-karta.v1.css` импортируется на своей странице |
| `js/*-config.js` с подстановкой URL | эндпоинты `src/pages/js/*-config.js.ts` с теми же путями и содержимым `window.ZVENFIT_* = '…'`; переменные читаются при сборке как есть; в `development` пустые значения заменяются на `http://localhost:3000`, `…/schedule`, `…/traffic`, в `staging` и `production` пустое значение валит сборку |
| `maps-config.js` с `apiKey` | эндпоинт `js/maps-config.js.ts` из данных, снимка фото и `Y_MAPS_API_KEY` |
| strip GTM, `noindex`, `robots.txt` для staging | ветвление только по `import.meta.env.MODE` (никогда по `PROD`/`DEV`) в `Analytics.astro`, layout и `robots.txt.ts` |
| фото организаций с Яндекс Карт при сборке | prebuild-скрипт обновляет снимок `src/data/map-photos.json`; сборка сеть не трогает |
| `slash-prefix` | применяется конвертером, в сборке не нужен |
| ручной `sitemap.xml` | `src/pages/sitemap.xml.ts`: страницы через `import.meta.glob('./**/*.astro', { eager: true })` с `export const updated` в каждой, тренеры из коллекции; формат как сейчас (`loc`, `lastmod`, `changefreq`, `priority`), без `404`; интеграция `@astrojs/sitemap` не подходит, она пишет `sitemap-index.xml` |
| `robots.txt` | `src/pages/robots.txt.ts`: production как сейчас, staging побайтно `User-agent: *\nDisallow: /\n` |

Релиз B: вендорные jQuery, `webflow.js`, `normalize.min.css`, `webflow.min.css`
переезжают в `src/vendor/`, подключаются через `?url` и
`<script is:inline src>` / `<link>` в прежнем порядке (jQuery, затем
`webflow.js`); `ASSET_VERSION` исчезает из сборки, workflow и теста деплоя.

## 6. Сборка, режимы и деплой

- `npm run build` = `MODE=${NODE_ENV:-production}; ASTRO_TELEMETRY_DISABLED=1
  NODE_ENV=production astro build --mode "$MODE"`: режим берётся из
  `NODE_ENV`, но в процесс Astro уходит нормализованный `NODE_ENV`, чтобы
  `import.meta.env.PROD` не зависел от окружения. Режимы `production`,
  `staging`, `development`. Переменные окружения не переименовываются.
- Порядок проходов `aws s3 sync` в `_deploy-environment.yml` и `deploy:yc`
  **с релиза A** (решение R7, перенесено из B по итогам сухого прогона):
  (1) ассеты без `--delete`, `immutable`, с исключениями `*.html`,
  `robots.txt`, `sitemap.xml`, `js/*-config.js`; (2) `robots.txt` и
  `sitemap.xml`, no-cache; (3) `*.html` и `js/*-config.js`, no-cache;
  (4) очистка `--delete` с теми же исключениями, что в (1). Проход 4 выключен
  на первом релизе A и на первом релизе B (откат не должен ссылаться на
  удалённые файлы) и включается следующим релизом. Тест
  `deploy-lead-intake.test.cjs` переписывается на четыре команды, порядок и
  отсутствие `--delete` в первой.
- Если проверка этапа 0 покажет, что CDN кэширует HTML: минимальная правка
  CDN (уважать `Cache-Control` источника для HTML или шаг purge в деплое с
  правами deploy SA), каждое изменение с подтверждением владельца и записью в
  ADR (решение R12); если правка невозможна — хранение ассетов двух последних
  релизов по манифесту вместо прохода 4.
- Dev после релиза A: `npm run dev` = сборка функций + `mock-server` на :3000
  + `astro dev --mode development --port 4173`. `watch-static.cjs` удаляется.
  `.env.development` читается только в этом режиме, `.env` и `.env.local` —
  всегда.
- Релизный конвейер не меняется: merge в `main` → staging → 8 тестов E2E →
  production → smoke. `skip_staging` для релизов A и B и для их revert не
  используется (решение R11).

## 7. Этапы

### Этап 0. Условия входа, решения, инвентаризация

Условия входа в ветку A, все обязательны:

- **Staging восстановлен**: ручной `staging.yml` на текущем `main` прошёл
  деплой, smoke и 8 тестов E2E зелёным; релиз #80 выпущен обычным путём,
  production равен `main`. Причина потери TCP-соединений gateway найдена и
  устранена (отдельная задача: поддержка Yandex Cloud с trace-id,
  передеплой или пересоздание gateway с обновлением CNAME).
- **Пункт 1 PRJ-007 сделан на legacy**: `imask` отдаётся со своего хостинга с
  `defer`, форма отправляется и без маски. Ветка A наследует `src/vendor/imask`.
- Снимок бакета `zvenfit-frontend` перед релизом A скриптом
  `scripts/snapshot-bucket.sh` (локальные ключи, `aws s3 sync` в каталог вне
  репозитория); versioning бакета не включается.
- Проверки инфраструктуры, результат в `knowledge-base/`: кэширует ли CDN
  HTML и как его сбросить; лицензии Roadrage, экспортированного рантайма
  Webflow (`webflow.js`, `webflow.min.css`), `normalize` (MIT), `imask` (MIT),
  Roboto (Apache 2.0).
- `scripts/inventory-bucket.cjs`: все ссылки на `storage.yandexcloud.net/zvenfit/v2`
  из HTML, CSS, `scripts/*.json` и сниппетов с размерами (HEAD-запросы),
  группировкой по типу и пометкой, что остаётся в бакете (`documents/`,
  `images/coaches/`).
- ADR `knowledge-base/decisions/2026-10-astro-migration.md` с итогами
  R1–R12 и ссылкой на этот план; запись в `knowledge-base/_index.md`.
- PR в `main`: пометка в `AGENTS.md` о ветке A (правило о стеке остаётся),
  `docs/future/README.md`, `repo-manifest.json.project_ids` со всеми
  связанными карточками (сверить с Workspace, включая PRJ-009), карточка
  проекта в Workspace с зависимостью из PRJ-007. `.cursor/rules/*` на этом
  этапе не переписываются, только пометка.
- Правило координации с другими проектами на время ветки A: `functions/`
  свободны; `AGENTS.md`, `repo-manifest.json`, корневой `package.json`,
  `.github/` меняются маленькими PR в `main`, затем `git merge main` в ветку A;
  у конфигурации Dependabot один владелец.
- Заморозка `public/**`, `scripts/snippets/**`, `scripts/*.config.json`,
  `scripts/build-static.cjs` с открытия ветки A. Hotfix (решение R10): ошибка,
  мешающая оставить заявку, неверная цена или юридический текст; новые
  тренеры, акции и правки текстов ждут релиза A. Процедура hotfix: PR в
  `main` → обычный релиз legacy → `git merge main` в ветку A → страницы
  регенерируются конвертером с `--ref main` (страницы из `manual.json`
  переносятся вручную), правки CSS, скриптов, конфигов и сниппетов
  переносятся по diff → compare-dist по затронутым страницам. Окно
  заморозки по оценке раздела 14: 2–4 недели.

### Ветка A и структура PR

Работа идёт в ветке `feature/astro-release-a`. Внутрь неё стековые PR: A1
(каркас и проверки), A2a (конвертация и коллекция, с отчётом compare-dist и
`manual.json`), A2b (удаление legacy), A3 (документация). Итоговый PR из
ветки в `main` один, squash с типом `feat(frontend): …` (minor-версия
релиза). Предмет ревью владельца: отчёт compare-dist, `manual.json`, layout и
компоненты, переписанные проверки и workflow, а не тела 41 страницы.

### Этап A1. Инструменты и проверки

- Пин `astro` 7.4.x, `@astrojs/check`, `prettier-plugin-astro`,
  `eslint-plugin-astro`; `engines.node >= 22.22` в корне, `.nvmrc` 22.23.3,
  `check-latest: true` у `setup-node` в обоих workflow этого репозитория;
  `astro.config.mjs`, `tsconfig.json`, `.astro/` в `.gitignore`;
  `ASTRO_TELEMETRY_DISABLED=1` в скриптах `package.json`.
- Layout и компоненты раздела 4; `Base.astro` воспроизводит бакетные адреса
  `normalize.min.css`, `webflow.min.css`, jQuery и `webflow.js?v=ASSET_VERSION`
  как у legacy-страниц; prop `data-zvenfit-page`.
- Эндпоинты конфигов и `maps-config` (нужны уже здесь: их требуют
  `check-staging-build` и smoke); проверка в `astro dev` и `astro build`, что
  `js/lead-config.js.ts` отдаётся по `/js/lead-config.js`.
- Конвертер и `manual.json`; `scripts/compare-dist.cjs` (раздел 8) с
  devDependency HTML-парсера и его job в `quality.yml` с `timeout-minutes`,
  `fetch-depth: 0`, базой `github.base_ref` или `main` при ручном запуске,
  `npm ci` в worktree базы.
- Проверки переписываются один раз, таблица `check-build.cjs`:

  | Проверка | Судьба |
  | --- | --- |
  | CDN-адрес `webflow.js` по страницам `public/`, падение при нуле страниц | удаляется; вместо неё: каждая страница `dist/` ссылается на бакетный `webflow.js?v=` (до B), локального `dist/js/webflow.js` нет |
  | `?v=` у CSS и скриптов клубной карты и главной | `_astro/<имя>.<хэш>` для стилей и скриптов; конфиги `/js/*-config.js` без `?v=` |
  | `404` без бикона, бикон на остальных | по basename `traffic-beacon.<хэш>.js` |
  | строки в `public/css/zvenfit.webflow.css` и `dist/css/klubnaya-karta.v1.css` | читаются из `src/styles/*.css` (исходники, не минифицированный вывод) |
  | форма, клубная карта (`id`, canonical, CTA, `main`, `#contacts`), «Самостоятельно», логотип, `maps-config` в `vm`, `traffic-config` без плейсхолдера, логотип в JSON-LD | без изменений |
  | новые | `data-wf-page` валиден, дубли `id` и покрытие `w-node-*` по `dist/` (перенос из `check-webflow-layout.cjs`), маркер `data-zvenfit-page` для отзывов (перенос из `webflow-layout.test.cjs`), наличие Метрики, Top.Mail.Ru, GTM, UTM и бикона на каждой странице кроме `404` в режиме `production`, запрет `data-astro-cid-*` и `astro-island`, отсутствие страниц одновременно в `public/` и `src/pages` |

  `check-webflow-layout.cjs`, `webflow-layout.test.cjs` и `test:layout`
  удаляются; `test:build` = `astro check` + `npm run build` + `check-build`;
  `test-staging-build.cjs` вызывает `npm run build` с `NODE_ENV=staging` и
  сохраняет самообеспечение окружением; `check-staging-build.cjs` без
  изменений по сути.
- `smoke-production.cjs` и его тест: `extractScriptUrl` принимает
  `/_astro/<имя>.<хэш>.js` для `lead-form.js`, `schedule.js`,
  `traffic-beacon.js` (имена гарантированы `?url`); конфиги по-прежнему
  `/js/*-config.js`.
- Деплой: четыре прохода раздела 6 в `_deploy-environment.yml` и `deploy:yc`,
  тест деплоя переписан.
- ESLint: `src/**/*.{js,ts,astro}`; корневой `tsconfig.json` в
  `parserOptions.project`; `src/pages/**/*.astro` исключены из `max-lines` и
  `prettier/prettier` до пункта 10 ревью; `max-lines` выключен для
  `src/scripts/schedule.js` и `yandex-map.js`; `import/no-default-export`
  выключен для `astro.config.mjs`. Prettier по сконвертированным страницам не
  запускается, пока compare-dist не чист. `project-checks.json`: `layout`
  заменяется на `parity` (`writes`, `requires_network`); новые npm-скрипты не
  попадают под маски теста деплоя.
- Документация внутри ветки: `AGENTS.md` (с сохранением маркера
  `<!-- personal-ai-workspace-code-policy:v1 -->`), README «Где менять код»,
  `.cursor/rules/*` обновляются уже здесь, чтобы агент в ветке не читал
  устаревшие инструкции.
- Готово, когда: `astro check` зелёный; сборка проходит в трёх режимах, в
  том числе с экспортированным `NODE_ENV=staging` и `development` как в CI;
  compare-dist чист по трём юридическим страницам; реальные имена файлов в
  `dist/_astro/` совпадают с ожиданиями smoke и `check-build`.

### Этап A2. Конвертация всех страниц, коллекция тренеров, вывод legacy

- A2a. Конвертер прогоняется по 41 файлу; ручные правки фиксируются в
  `manual.json`; каждая страница проходит компилятор Astro.
- Коллекция `trainers`: `slug`, `wfPage`, `name`, `nameDative`, `jobTitle`,
  `location`, `photoClass?`, `groups: [{ heading, itemsHtml[] }]`,
  `certificates?: [{ title, href }]`, `certificatesSectionEmpty?`,
  `nextSlug`, `updated`, `meta: { title, description }`,
  `fitbaseTrainerId?`. Шесть `w-node-*` — константы шаблона с суффиксом
  `wfPage.slice(-8)`. Одна схема и один шаблон на все 21 страницу,
  спецшаблонов ноль; `StructuredData.astro` берёт `Person` из коллекции, блок
  `trainers` конфига удаляется.
- Скрипты через `?url` по разделу 4; `sitemap.xml.ts`, `robots.txt.ts`,
  снимок фото карт.
- A2b. `build-static.cjs`, `watch-static.cjs`, сниппеты, `public/*.html`,
  `public/css`, `public/js`, `public/sitemap.xml`, `public/robots.txt`,
  `clean-css` из `package.json` удаляются; конфиги в `src/data/`.
- Готово, когда: compare-dist чист по всем 41 страницам (allow-list только из
  раздела 2), `test:build`, `test:build:staging`, `test:scripts`, `lint`
  зелёные, `dist/` не содержит `data-astro-cid-*`.

### Этап A3. Гейт, документация, релиз A

- Pre-merge гейт (раздел 8) пройден, отчёт локального прогона автотестов
  приложен к PR. Документация: README, `AGENTS.md` (раздел 14),
  `knowledge-base/_index.md`, `knowledge-base/site-information-architecture.md`,
  `TODO.md` (закрыт «Auto-generate sitemap»), `docs/launch-checklist.md`
  (пункт про `ASSET_VERSION` теперь только о `webflow.js`).
- До merge: в `zvenfit-autotests` `check-latest: true` для Node в `quality.yml`
  и `production-smoke.yml` (их CI собирает фронтенд из `main` и с релиза A
  выполняет `astro build`); пин SHA здесь отдельным PR.
- Merge → релиз. Первые 30 минут: доля 404 в `edge.requests_status` CDN и
  page views site-traffic в Monium не хуже предыдущего часа (смотрит агент);
  сверка Метрики за сутки (смотрит владелец); CI автотестов и ежедневный
  production-smoke зелёные.
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
  генерирует WebP нужных ширин по фактической ширине карточек. Картинки без
  людей — в `src/assets/images/`, CSS переписывается на локальные пути через
  Vite, `image-set()` там, где нужен fallback; в репозиторий коммитятся только
  оптимизированные файлы (решение R5). **Фото тренеров (`images/coaches/`,
  47 файлов) не попадают в git**: оптимизированные копии заливаются в бакет
  под новым префиксом с `Cache-Control`, CSS ссылается на них (решение R9).
- Roadrage в WOFF2 с `font-display`, Roboto самохостинг вместо
  `fonts.bunny.net`; вендорные CSS/JS в `src/vendor/` через `?url`;
  `ASSET_VERSION` удаляется из сборки, workflow, `.env.example` и теста деплоя.
- `og:image` конфига и клубной карты, SVG-бейджи, пины карт и фото локаций
  переезжают в `src/assets/`; favicon и webclip в `public/` под новыми именами
  с версией, потому что они не хэшируются и попадают под `immutable`.
- Сертификаты тренеров остаются в бакете (решение R4): им выставляется
  `Cache-Control` отдельно. Операции с бакетом (`Cache-Control` на
  `documents/` и `images/coaches/`, заливка оптимизированных фото, архив
  оригиналов) — шаги владельца или по его явному одобрению.
- `check-build.cjs`: запрет локального `webflow.js` снимается; `dist/`
  может ссылаться на бакет только по префиксам `documents/` и новому
  префиксу фото тренеров.
- Документы: `knowledge-base/staging-runbook.md` (`ASSET_VERSION`, кэш CDN и
  браузера), `docs/launch-checklist.md`, `docs/setup.md`, `.env.example`;
  `robots.txt` без `/js/` и `/css/` уходит в пункт 7 ревью вместе с `Host` и
  `Crawl-delay`.
- Готово, когда: главная на телефоне ≤ 1,5 МБ (замер до и после в карточку
  проекта), в `dist/` нет ссылок на бакет кроме двух префиксов, pre-merge
  гейт пройден с новым SHA автотестов, релиз прошёл staging и E2E.

### После миграции, в рамках PRJ-007 и TODO

- Пункт 5: цели из кода, GTM убирается в `Analytics.astro`.
- Пункт 10: отказ от `webflow.js` и jQuery, свои выпадашки, слайдеры, табы;
  обновление пяти файлов автотестов с Webflow-классами; снятие исключений
  `max-lines` и Prettier для страниц.
- Пункт 3: вид расписания на телефоне, при необходимости островок.
- TODO «Footer duplication» и «Navigation hierarchy»: один футер и одно меню.
- Ревизия клиентских скриптов (по ощущению владельца в 2,5 тысячах строк
  много лишнего): замер реально выполняемого кода (Coverage в DevTools на
  staging и прогон E2E), удаление мёртвых веток и дублей, перевод в модули и
  TypeScript по порядку из раздела 4.

## 8. Паритет и pre-merge гейт

`scripts/compare-dist.cjs` сравнивает `dist/` базовой ветки (legacy-сборка
`main` в `git worktree` после `npm ci`, те же переменные окружения, тот же
снимок фото карт) и `dist/` ветки по всем 41 страницам. Сравниваются:

- `<title>`, все `<meta>` и `<link>` в `<head>` (description, canonical,
  robots, Open Graph, Twitter, referrer, preconnect, favicon);
- JSON-LD как разобранный JSON; inline-скрипты после нормализации пробелов;
- `data-wf-page`, `data-wf-site`, `lang`, `data-zvenfit-page`;
- последовательность заголовков с текстом; список `id` с дублями; все `href`
  внутренних и внешних ссылок; **последовательность** скриптов и стилей по
  таблице соответствия: `/js/<имя>.js?v=` ↔ `/_astro/<имя>.<хэш>.js`,
  `/css/zvenfit.webflow.min.css?v=` и `/css/klubnaya-karta.v1.css?v=` ↔
  `/_astro/*.css`, конфиги без `?v=`, бакетные адреса без изменений;
- видимый текст с нормализованными пробелами;
- `sitemap.xml` по разобранным `<url>` (`loc`, `lastmod`, `changefreq`,
  `priority`) и `robots.txt` целиком.

Исключения по умолчанию: порядок атрибутов, хэши и `?v=` в адресах
ресурсов, пробелы между тегами, `defer` у `webflow.js` на `/offer/`,
отсутствие аналитики в режиме `development`. Другие расхождения только по
явному allow-list в PR. После релиза B job в `quality.yml` снимается, скрипт
остаётся инструментом.

Pre-merge гейт для итогового PR A и для PR B, выполняет агент и прикладывает
отчёт комментарием к PR (SHA обоих репозиториев, версия Playwright, команда и
окружение сборки, итог reporter):

1. `npm run lint`, `npm run test:scripts`, `npm run test:build`,
   `npm run test:build:staging`, compare-dist без расхождений вне allow-list.
2. Сборка ветки `NODE_ENV=development npm run build`; в `zvenfit-autotests`
   `git checkout <SHA из main.yml>`, `npm ci`, `npx playwright install
   chromium`, `ZVENFIT_FRONTEND_PATH=<checkout ветки> npm run check` (11 спек,
   staging исключён конфигом; порт 43987 свободен).
3. При красных тестах: регрессия фронтенда — чинится в ветке; устаревшее
   допущение теста (путь, `?v=`, класс) — сначала PR в `zvenfit-autotests`,
   новый пин SHA отдельным PR здесь, повтор гейта.
4. `quality` и CodeQL зелёные.

Staging и 8 тестов E2E после merge — релизный гейт, а не критерий готовности.

## 9. Откат и остановка

- Откат релиза A или B — revert PR через обычный релиз со staging и E2E,
  около 10 минут; `skip_staging` не используется и для revert (R11). Проход 4
  деплоя выключен на первом прогоне каждого из релизов, поэтому откат не
  ссылается на удалённые файлы.
- Сценарии падения релиза A: (1) упал staging smoke или E2E — production не
  тронут, fix-forward новым PR, если причина понятна за час, иначе revert;
  (2) упал production smoke после заливки — автоотката сайта нет, немедленный
  revert PR, при CDN-кэше HTML — purge по R12; (3) staging прошёл, а
  production ведёт себя иначе из-за CDN — сигналы 30 минут из A3, при
  ухудшении revert; (4) CI автотестов или ежедневный production-smoke
  покраснели после merge — fix-forward здесь или временный пин ref фронтенда
  в их workflow до исправления.
- Условие остановки ветки A: страница, которую не удаётся привести к паритету
  за разумное время, блокирует релиз; решение владельца: ждать, принять
  отклонение в allow-list или закрыть ветку без merge.
- Оригиналы ассетов в бакете не удаляются до отдельного решения после
  релиза B; снимок бакета перед A хранится до релиза B.

## 10. Риски

| Риск | Мера |
| --- | --- |
| Компилятор Astro 7 падает на невалидном HTML экспорта | конвертер прогоняет страницу через компилятор; правки фиксируются в `manual.json` |
| `compressHTML: 'jsx'` ломает раскладку | `compressHTML: false` навсегда |
| Astro и Vite инлайнят мелкие скрипты и CSS | `assetsInlineLimit: 0`, `inlineStylesheets: 'never'` |
| Имена чанков не содержат basename | скрипты через `?url`; проверка реальных имён в `dist/` в A1 |
| Фигурные скобки и `<script src>` без `is:inline` | конвертер экранирует и ставит директиву всем скриптам |
| `webflow.js` и интеракции зависят от `data-wf-page`, `data-wf-site`, `w-node-*` | атрибуты в props layout и в коллекции тренеров; проверка в `check-build` |
| jQuery и `webflow.js` перестают быть глобальными при бандлинге | только `?url` и `<script is:inline src>`, порядок jQuery → `webflow.js` |
| Порядок CSS: normalize → webflow → zvenfit → страница | явный порядок в `Base.astro`, проверка в compare-dist |
| `NODE_ENV=staging` делает `PROD` ложным | нормализация в скрипте сборки, ветвление только по `MODE` |
| Smoke после деплоя ищет жёсткие пути скриптов | адаптация в A1, конфиги на прежних путях, basename через `?url` |
| Конфиги под `immutable` без `?v=` | no-cache проход и `--exclude` в A1 |
| `s3 sync --delete` удаляет старые ассеты раньше HTML | новый порядок проходов в A1, проход 4 выключен на первом релизе, проверка CDN на этапе 0 |
| Тихая потеря аналитики на перенесённой странице | проверка наличия счётчиков в `check-build`, детекторы 30 минут, сверка Метрики |
| Длинная ветка A и правки `public/` на `main` | заморозка и процедура hotfix из этапа 0, конвертер с `--ref main` |
| `max-lines` и Prettier по телам страниц | исключения в ESLint, Prettier не запускается по страницам |
| E2E меняют условия, когда вендорные ассеты уходят с бакета | этап B1 до релиза B, пин SHA |
| CI автотестов собирает фронтенд сам | `check-latest` для Node там до релиза A, проверка после merge |
| Favicon и webclip под `immutable` без хэша | версия в имени файла |
| Персональные данные в публичном репозитории | сертификаты и фото тренеров остаются в бакете (R4, R9); `secret_scan.py` и просмотр партии перед коммитом |
| Рост зависимостей, sharp с нативными бинарниками | `npm ci` в CI, Dependabot version updates, CodeQL без изменений |
| Staging нестабилен | условие входа этапа 0, релиз без `skip_staging` |

## 11. Решения

Приняты владельцем 2026-10-19 и 2026-10-21; после этапа 0 этот раздел
становится ссылкой на ADR:

- **R1. Идём в миграцию.**
- **R2. Два релиза**: A — сборка и страницы, B — ассеты.
- **R3. Конфиги API** — эндпоинты на прежних путях `/js/*-config.js` плюс
  no-cache правило в деплое (с релиза A).
- **R4. Сертификаты и дипломы тренеров** остаются в бакете.
- **R5. Картинки, шрифты и вендорные файлы** — оптимизированные в
  репозиторий, оригиналы в бакете как архив.
- **R6. Строгий паритет** в релизе A, пункты 6, 8, 11 отдельными PR после.
- **R7. Деплой**: ассеты без `--delete` → crawl-файлы → HTML и конфиги →
  очистка; применяется с релиза A.
- **R8. Гейт E2E**: полный набор локально до merge, 8 тестов в релизе.
- **R9. Фото тренеров** не попадают в git: оптимизированные копии в бакет с
  `Cache-Control`.
- **R10. Hotfix на время ветки A**: заявки, цены, юридические тексты;
  остальное ждёт релиза A.
- **R11. Revert** только через staging, без `skip_staging`.
- **R12. CDN**: при кэше HTML допускается минимальная правка CDN с
  подтверждением владельца и записью в ADR.

По умолчанию, пересматриваются по запросу:

- Снимок бакета перед релизом A вместо включения versioning.
- Пункт 1 PRJ-007 (маска телефона) делается сейчас на legacy, до ветки A.
- Dependabot version updates для корневого `package.json` и функций,
  еженедельно, с группировкой minor и patch; security-алерты уже включены.
- Фото организаций с Яндекс Карт — снимок в `src/data/`, обновление скриптом.
- Островки на клиентском фреймворке — не в миграции, решение при пункте 3.
- Текст правила `AGENTS.md` — раздел 14.

Открытые, вне этого плана: дата открытия ветки A (после восстановления
staging); пункты 3, 5 и 13 PRJ-007.

## 12. Не входит

Редизайн, чистка Webflow CSS, ревизия и перевод существующих скриптов на
модули и TypeScript (итерация после миграции), изменение текстов и цен,
отказ от рантайма Webflow, GTM, юридические вопросы, восстановление staging
(отдельная задача и условие входа), настройки редиректов и `robots.txt`
(пункт 7 ревью), настройки CDN сверх минимальной правки по R12.

## 13. Метрики результата

- Правка футера или меню: один файл вместо 18 или 40.
- Новый тренер: один JSON, ноль HTML; H1 и title тренеров: один шаблон.
- Главная на телефоне ≤ 1,5 МБ после релиза B; LCP на телефоне для `/` и
  `/klubnaya-karta/` до и после каждого релиза.
- Первые 30 минут после релиза: доля 404 в `edge.requests_status` CDN и page
  views site-traffic в Monium не хуже предыдущего часа.
- Просмотры в Метрике и Top.Mail.Ru за сутки после каждого релиза не ниже
  медианы предыдущей недели с поправкой на день недели.
- Покрытие индекса в Вебмастере и Search Console без выпадений через две
  недели после релиза A.
- Ссылок на бакет в `dist/`: ноль, кроме `documents/` и префикса фото
  тренеров.
- Время сборки в CI и локально, для сравнения с 2026-10-19.

## 14. Оценка и документация

Рабочие дни агентной разработки с ревью владельца, без ожиданий релизов, с
поправкой 20–30 % по совету первого независимого ревью. Восстановление
staging не оценивается, это отдельная задача.

| Этап | Оценка |
| --- | --- |
| 0. Условия входа, инвентаризация, ADR, карточка, пункт 1 PRJ-007 | 2–3 |
| A1. Инструменты, конвертер, переписанные проверки и деплой | 4–5 |
| A2. Конвертация 41 страницы, коллекция тренеров, вывод legacy | 4–6 |
| A3. Гейт, документация, релиз A | 1–2 |
| Довески после A (пункты 6, 8, 11) | 1–2 |
| B1. Автотесты и пин SHA | 1–2 |
| B2. Ассеты, фото тренеров в бакет, релиз B | 3–5 |

Текст правила для `AGENTS.md` в ветке A с этапа A1 и в `main` после релиза A
(на этапе 0 в `main` остаётся прежнее правило с пометкой о ветке):

> Фронтенд собирается Astro в статический `dist/`; страницы живут в
> `src/pages`, общая разметка в `src/layouts` и `src/components`, данные в
> `src/content` и `src/data`, статика как есть в `public/`. Клиентский
> фреймворк на страницах не используется; островок допустим для отдельного
> виджета с обоснованием в PR. Не предполагать React или Next.

Маршрутизация знаний: этот файл — техническая часть; после merge PR этапа 0
он переезжает в `docs/astro-migration.md`. Статус этапов и открытые вопросы
ведутся в карточке проекта Workspace, итоги решений — в ADR в
`knowledge-base/decisions/`, со взаимными ссылками и без дублирования текста.
