# План миграции фронтенда на Astro

Редакция 5.1 от 2026-10-22. История: черновик 2026-10-04, редакция 2 после
собственного ревью 2026-10-05, раздел TypeScript 2026-10-12, независимое ревью
двух рецензентов 2026-10-12, решения владельца R1–R8 и редакция 3 2026-10-19,
второе независимое ревью трёх рецензентов (техническое, процессное и сухой
прогон релиза A) 2026-10-20, решения R9–R12 и редакция 4 2026-10-21, ревью
Codex с владельцем и редакция 5 с исполнимыми контрактами 2026-10-22, панель
независимых оценщиков по деплою и откату (шесть линз, двенадцать голосов
скептиков, судья), решения R13–R15 и редакция 5.1 2026-10-22; находки Codex об
откате влиты в разделы 6 и 9. Редакция 5.1 сохраняет решения R1–R15;
реализация миграции ещё не начата.
С открытием ветки A (PR A1, 2026-10-27) файл живёт в `docs/astro-migration.md`;
статус этапов ведётся в карточке проекта Workspace, здесь только техническая
часть.

Связанные записи: [`TODO.md`](../TODO.md) («Footer duplication» отложен «до
перехода на шаблонизатор», «Auto-generate sitemap», «Navigation hierarchy»),
правило о стеке в [`AGENTS.md`](../AGENTS.md), пункты 1, 2, 4, 5, 6, 7, 8,
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
- На production: аналитика, GTM и UTM. На staging: сторонней аналитики и GTM
  нет; UTM и технический бикон (кроме 404) остаются как в legacy, API через
  same-origin gateway, `noindex`, `robots.txt` побайтно
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
(раздел 6): `js/*-config.js` переходят из `immutable` в no-cache, `--delete`
снимается с прохода ассетов, проход HTML делится на две команды. Всё это
вводится подготовительным PR в `main` на legacy до ветки A (R14); релизы A и
B workflow деплоя не меняют. Очистка устаревших `_astro/*` — отдельная
ручная процедура вне релизного workflow (R13).

## 3. Факты, от которых отталкивается план

Снято с репозитория 2026-10-04 … 2026-10-22; числа считаются по 41 файлу,
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
  общих `id="w-node-…"`; у Натальи Шулеповой ещё 6 на карточках сертификатов
  (12 всего). Суффикс равен последним 8 hex `data-wf-page`;
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
  в `_deploy-environment.yml`, **ровно три** команды `aws s3 sync` (состояние до
  подготовительного PR этапа 0),
  `timeout-minutes ≤ 20` у каждого job, job `quality` без `name:` и `paths:`,
  и запрещает npm-скрипты по маскам `playwright|e2e` (имя) и
  `playwright|tests?[:/]e2e|tests?[:/]staging` (команда).
- Деплой до подготовительного PR (`_deploy-environment.yml`, то же в
  `deploy:yc`): три прохода `aws s3 sync --delete`: (1) всё кроме `*.html`,
  `robots.txt`, `sitemap.xml` с `immutable`; (2) `robots.txt` и `sitemap.xml`
  no-cache; (3) `*.html` no-cache. Конфиги `js/*-config.js` сегодня уходят с
  `immutable` и живут только благодаря `?v=`. В CI каждый файл `dist`
  перезаливается всегда: `build-static.cjs` пересоздаёт `dist/`, время
  изменения файлов новее объектов в бакете, и новый `Cache-Control`
  применяется; не перезаливаются файлы только при ручном `deploy:yc` из
  старого `dist`. `--metadata-directive REPLACE` при загрузке с диска ничего
  не делает, но регулярка теста деплоя использует его как границу команды.
- Окружение: workflow передаёт `NODE_ENV` (`staging`/`production`),
  `LEAD_API_URL`, `SCHEDULE_API_URL`, `TRAFFIC_API_URL`, `Y_MAPS_API_KEY`,
  `ASSET_VERSION`; CI автотестов и `npm run dev` используют
  `NODE_ENV=development`. Astro режимы задаются `--mode`; `.env.<mode>`
  читается по режиму, `.env` и `.env.local` всегда; экспортированный
  `NODE_ENV` просачивается в Vite и делает `import.meta.env.PROD` ложным при
  `staging`.
- Дополнительная проверка 2026-10-22: `stripGoogleTagManager` в
  [build-static.cjs](../scripts/build-static.cjs) (строки 352–357)
  захватывает текст от ближайшего `<script` до GTM, пересекая закрывающие
  теги. Изолированный прогон функции по исходному HTML показал удаление
  `favicon` и `apple-touch-icon` на всех проверенных страницах; на клубной
  карте также теряется собственный `og:image`, после чего
  `injectOpenGraphHead` (строки 413–416) подставляет `og:image` из конфига
  вместо `club-card/hero.webp`. Потеря bootstrap Webflow (`w-mod-js`) на трёх
  перепроверенных страницах не воспроизвелась и в условие не входит. В
  production функция не вызывается (строка 903). Исправление на legacy до
  открытия A — условие этапа 0; этот дефект не становится исключением из R6
  и не переносится в Astro.
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
  staging E2E 5 октября. Причина установлена 2026-10-22: инцидент Yandex
  Cloud #2136 с 11 октября 04:00 МСК (повреждение дата-центра во Владимире,
  платформа в аварийном режиме, не закрыт на 22 октября). Из той же сети
  вход Cloud Functions `functions.yandexcloud.net`, через который production
  ходит за расписанием и заявками, отвечает 4 раза из 10, сайт через CDN
  стабилен. Со стороны репозитория чинить нечего; восстановление staging и
  функций — ожидание окончания инцидента, условие входа в ветку A (этап 0).

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
    Analytics.astro         Top.Mail.Ru + Метрика + GTM (до пункта 5), mode production;
                            placement: head | body, исходное место каждого блока
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
public/                     в A две images/*.svg; favicon и webclip добавляются в B
scripts/migrate/html-to-astro.cjs   одноразовый конвертер, удаляется после релиза A
scripts/migrate/manual.json         страницы с ручными правками и причины
scripts/compare-dist.cjs            проверка паритета (остаётся как инструмент)
scripts/check-routes.cjs            общий guard маршрутов и ресурсов для Astro и legacy
                                    (появляется на legacy подготовительным PR этапа 0)
scripts/inventory-bucket.cjs        инвентаризация бакета (этап 0)
scripts/optimize-images.cjs         sharp-конвейер (релиз B)
scripts/snapshot-bucket.sh          снимок бакета перед релизом A (этап 0)
scripts/deploy.config.json          профиль сборки legacy | a | b (появляется на legacy)
scripts/cleanup-bucket-assets.cjs   очистка устаревших ассетов бакета, dry-run по умолчанию
scripts/__tests__/cleanup-bucket-assets.test.cjs   тесты очистки на фикстурах
.github/workflows/cleanup-assets.yml   ручной запуск очистки, workflow_dispatch
```

Конфиги контента `app-links.config.json`, `maps.config.json` и
`structured-data.config.json` переезжают из `scripts/` в `src/data/` в
релизе A; блок `trainers` уходит в коллекцию. Служебный
`scripts/deploy.config.json` остаётся рядом со скриптами деплоя.

### Данные общих компонентов

- `Menu.astro`: кроме `variant`, получает `secondary: { label, href,
  target?, dataBack? }`, `ctaTarget?`, `logo: 'svg' | 'text'`, `logoLabel?`,
  `logoEmbedClass?` и точные `wNode` из исходной страницы. Именованные слоты
  `cta`, `secondary`, `reviews`, `contacts` соответствуют
  `link-block-page1` … `link-block-page4`; у coach — `back` и `next`.
  Идентификаторы не восстанавливаются из одного общего префикса для всех
  страниц. `dataBack: true` выводит `data-back="true"`, отсутствие флага —
  отсутствие атрибута. У coach также передаётся `nextSlug`.
- Значения извлекаются из страницы, а не назначаются только по классу меню:
  тарифы, карты с доменами `yandex.ru` и `yandex.kz`, ссылка назад и CTA
  различаются внутри одного варианта. Текстовый логотип расписания,
  `aria-label`, `target` и классы обёртки сохраняются. Ссылка групповых
  тренировок на `yandex.kz` остаётся по R6; возможное исправление — отдельный
  PR после A.
- `Footer.astro`: кроме `withGrid`, `withMobile`, `withMap`, получает
  `location: 'chekhova' | 'nakhabinskoe'` и `anchorId?`. Вторая локация —
  у групповых тренировок; адрес, телефон и часы сохраняются. `id="contacts"`
  выводится только там, где он был. Юридическая ссылка на текущую страницу
  получает прежние `w--current` и `aria-current="page"` по
  `Astro.url.pathname`; остальные атрибуты и порядок классов сохраняются.
- Клубная карта сразу записывается в `manual.json`: собственные меню с
  img-логотипом и футер с отличающимися `rel` и часами остаются в странице.
  `Menu.astro`/`Footer.astro` к этим блокам не применяются. Любое другое
  различие, не выражаемое данными компонента, также требует записи в
  `manual.json`, а не молчаливой унификации.
- `Analytics.astro` выводит блок только при `MODE === 'production'`.
  Head-блок сохраняет порядок GTM и сниппета Top.Mail.Ru/Метрики, включая
  `noscript`. Вызов с `placement="body"` стоит на месте исходного GTM
  `noscript`, а не в едином хвосте layout: у тренеров он может предшествовать
  jQuery, у формы — скриптам формы. Скрипты карт и трафика добавляются после
  исходного содержимого body в прежнем порядке.

Шаблоны общих компонентов сохраняют межтеговые whitespace-узлы legacy:
между inline-block ссылками меню пробелы влияют на отступы.
`compressHTML: false` позволяет сохранить их; допустимые технические
нормализации ограничены правилами раздела 8.

### Скрипты в релизе A: классические, через `?url`

Существующие семь скриптов в релизе A не становятся модулями. Они лежат в
`src/scripts/`, импортируются как `?url` и подключаются
`<script is:inline src={url}>` с исходными атрибутами каждой страницы:
у всех семи есть `defer`, у `accordion-horizontal.js` и
`coaches-show-more.js` также `type="text/javascript"`. Эндпоинты подключаются
отдельно: `lead-config.js` без `defer`, `schedule-config.js`,
`traffic-config.js`, `maps-config.js` с `defer`. Ничего сверх исходных
атрибутов не добавляется, кроме согласованного `defer` у Webflow на `/offer/`.
Имя файла сохраняется в
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
даёт тот же `.astro` на выходе. Читает исходник по полному SHA legacy-базы
(`--ref <SHA>` из отчёта этапа), а не из меняющегося `main` или рабочего дерева,
потому что после A2 в ветке `public/` страниц нет. Что делает:

- вынимает title, description, canonical, `og:image` страницы (у клубной карты
  свой), `data-wf-page`, `data-wf-site`, `data-zvenfit-page`, вариант меню,
  данные меню/футера из контракта выше, флаги карт и CSS страницы,
  `sitemap: { updated, changefreq, priority }` из исходного sitemap во
  frontmatter;
- тело переносит как есть; экранирует фигурные скобки в тексте; ставит
  `is:inline` всем `<script>`, включая теги только с `src` (иначе Astro
  соберёт их как модуль); `<style>` в страницах нет;
- заменяет известные общие блоки (head, меню, футер, бейджи, маркеры) на
  компоненты; применяет `slash-prefix` один раз;
- извлекает GTM из head и body: сырой блок заменяется вызовом компонента
  на том же месте; атрибуты всех `script` и `link` сохраняются;
- проверяет обратимость меню и футера: отрендеренный production-блок с
  извлечёнными props сравнивается с блоком legacy production **dist** по
  правилам раздела 8. В исходном `public/` ещё находятся iframe и маркеры сборщика,
  поэтому он не является эталоном результата компонента. Неизменность этих
  блоков на staging доказывается сравнением режимов раздела 8. Несовпадение даёт
  ненулевой код, diff и необходимость записи причины в `manual.json`;
- для страниц из `scripts/migrate/manual.json` завершается ненулевым кодом с
  причиной; перезапись только с `--force`, после чего ручная правка
  переносится заново и фиксируется в том же файле.

Факты о компиляторе Astro 7.4.2, установленные в A1 (2026-10-27) и учтённые
конвертером и компонентами:

- HTML-комментарии внутри дочернего содержимого компонента (default- и
  именованные слоты, `<Fragment>`) и внутри выражений `{…}` компилятор
  удаляет; комментарии на верхнем уровне шаблона страницы, layout и
  компонента сохраняются. Комментарии GTM, Webflow и любые комментарии из
  тела страницы выводятся через `set:html`.
- Символ U+00A0 и другие Unicode-разделители (категория Zs, U+0085) в тексте
  шаблона компилятор превращает в обычный пробел; в шаблонах и конвертере они
  записываются сущностями (`&nbsp;`, `&#x2009;`). U+200D (ZWJ) сохраняется.
- Фигурные скобки в тексте читаются как выражения даже внутри обычных
  элементов; в значениях атрибутов они литеральны. Конвертер экранирует их
  как `&#123;`/`&#125;` везде, кроме содержимого `<script>` и `<style>`.
- Пробелы в начале и в конце шаблона компонента отрезаются; пробелы между
  узлами внутри шаблона и внутри слотов сохраняются (при `compressHTML:
  false`). Поэтому пробелы между соседними компонентами задаёт вызывающий
  шаблон (`{'\n  '}`), а не сам компонент.
- После `<!DOCTYPE html>` компилятор ставит перевод строки; parse5 его не
  видит. Самозакрывающиеся `<img … />` выводятся как `<img …>`; дерево то же.
- CSS, импортированный через `?url`, минифицируется lightningcss (умолчание
  Vite 8), а не clean-css: на `zvenfit.webflow.css` слились два правила с
  одинаковыми объявлениями, вендорные префиксы сохранены. Контракт сравнения
  проверяет исходники CSS и наличие собранного файла, а не байты минификации.

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
| `maps-config.js` с `apiKey` | эндпоинт `js/maps-config.js.ts` из данных, снимка фото и `Y_MAPS_API_KEY`; пустой ключ допускается как в legacy, правило обязательных API URL на него не распространяется |
| strip GTM, `noindex`, `robots.txt` для staging | ветвление только по `import.meta.env.MODE` (никогда по `PROD`/`DEV`) в обеих частях `Analytics.astro`, layout и `robots.txt.ts`; layout заменяет существующий robots meta на `noindex, nofollow`, а не добавляет второй (в том числе у 404 с исходным `noindex, follow`) |
| фото организаций с Яндекс Карт при сборке | отдельная команда `maps:snapshot` обновляет `src/data/map-photos.json`; это не npm lifecycle `prebuild`. Ключи и массивы URL имеют формат `maps.config.json.locationPhotos`. Обычная сборка читает фиксированный снимок и сеть не трогает; механизм сравнения с legacy — раздел 8 |
| `slash-prefix` | применяется конвертером, в сборке не нужен |
| ручной `sitemap.xml` | `src/pages/sitemap.xml.ts`: страницы через `import.meta.glob('./**/*.astro', { eager: true })` с `export const sitemap = { updated, changefreq, priority }` в каждой; `404.astro` и `trenery/[slug].astro` исключены из glob, маршруты тренеров берутся из коллекции. Все значения импортируются из исходного XML: 9 значений priority и 4 changefreq, lastmod у всех 40 URL. Формат как сейчас (`loc`, `lastmod`, `changefreq`, `priority`); интеграция `@astrojs/sitemap` не подходит, она пишет `sitemap-index.xml` |
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
  **с подготовительного PR этапа 0** (решение R7, срок уточнён R14): три
  прохода, четыре команды. (1) ассеты без `--delete`, `immutable`, с
  исключениями `*.html`, `robots.txt`, `sitemap.xml`, `js/*-config.js`;
  (2) `robots.txt` и `sitemap.xml`, no-cache, `--delete` внутри фильтра;
  (3) сначала `js/*-config.js`, затем `*.html`, обе команды no-cache, с
  `--delete` внутри своих фильтров (R15): снятая страница исчезает релизом,
  как сегодня, а конфиг обновляется раньше ссылающегося на него HTML.
  `--delete` запрещён только в проходе 1: ассеты в релизе не удаляются
  никогда. Каждая следующая команда выполняется только после успешной
  предыдущей; в журнале остаётся последняя завершённая фаза. Частичная
  заливка не считается успешным релизом и восстанавливается повторным
  полным прогоном или откатом по разделу 9.
- После фактической сборки в `deploy-site`, до первого `sync`, выполняются
  `check-routes.cjs` и `check-build.cjs` из разворачиваемого дерева;
  на staging также `check-staging-build.cjs`. Для `check-routes` выбирается
  `--source public` при `profile: 'legacy'`, `--source astro` — для `a` и `b`.
  Проверяется именно загружаемый `dist`, а не только отдельная сборка job `quality`.
  Проверка равенства множеств маршрутов получает ожидаемые пути из исходников
  (индексируемое множество тоже из исходников: для legacy `public/` минус
  `404.html`, не из meta в `dist`, потому что staging ставит `noindex` всем
  страницам):
  статические `src/pages/**/*.astro` плюс slugs коллекции, без эндпоинтов и
  динамического шаблона; для legacy — HTML из `public/`. Они должны точно
  совпасть с HTML в `dist`, а индексируемая часть — с `sitemap.xml`; `404.html`
  существует отдельно. На старте это 41 HTML и 40 URL. Ручного списка для
  каждого нового тренера нет. Пустой `dist`, пропавший или подменённый маршрут,
  отсутствие одного из четырёх конфигов, crawl-файлов или локального ресурса
  блокируют первый `sync`. Проверки содержимого и режима сохраняются;
  production `404.html` штатно содержит `noindex, follow`.
  Общий `check-routes.cjs` реализует guard множеств и обязательных ресурсов
  без зависимости от Astro и не откатывается при возврате legacy.
  Режим полного набора включён по умолчанию; частичный `--profile a1`
  разрешён только внутри ветки A1 (три legal без требования 404, по разделу 8),
  в deploy он запрещён. Проверки содержимого остаются в `check-build.cjs`
  соответствующей версии, а не копируются из Astro в legacy.
- В `scripts/deploy.config.json` одно поле: `profile: 'legacy' | 'a' | 'b'`.
  Подготовительный PR вводит его со значением `legacy`, ветка A ставит `a`,
  ветка B — `b`; тест проверяет соответствие профиля дереву (есть
  `src/pages` ↔ профиль не `legacy`). Частичного профиля `a1` здесь нет.
- **Очистка устаревших ассетов — отдельная ручная процедура вне релизного
  workflow (решение R13).** Файл `.github/workflows/cleanup-assets.yml`,
  только `workflow_dispatch`, входы: `environment` (staging | production),
  `execute` (по умолчанию `false`, то есть dry-run), `min_age_days` (значение
  из отчёта этапа 0, не меньше наибольшего из TTL HTML на edge, browser TTL
  и 36 часов вытеснения CDN), `prefixes` (по умолчанию `_astro/`).
  Аутентификация через `environment:` и OIDC, как в уже существующем
  `telegram-delivery-backup.yml`; `concurrency: group: deploy`,
  `cancel-in-progress: false`, чтобы очистка не шла параллельно с релизом;
  `timeout-minutes` ≤ 20. Workflow оборачивает
  `scripts/cleanup-bucket-assets.cjs`, пригодный и для локального запуска; у
  скрипта unit-тесты на фикстурах. Кандидат на удаление: ключ под указанным
  префиксом, которого нет в свежесобранном production-`dist` того же SHA, что
  живёт на production, и чей `LastModified` старше порога. Предусловие:
  множество ссылок на `/_astro/…` в HTML, лежащем в бакете, равно множеству
  в `dist`; иначе скрипт останавливается («живой HTML не из этой сборки:
  релиз идёт или упал»). Список кандидатов печатается в summary; удаление
  только при `execute: true`. Запускает владелец, не раньше TTL HTML после
  последнего релиза или отката. Выходит отдельным PR после релиза A
  (раздел 7), не в подготовительном PR и не в squash A. Legacy `js/`, `css/`,
  `images/` чистятся после B той же процедурой с явным входом `prefixes`;
  префиксы по R4 и R9 и бакет `zvenfit/v2` процедурой не затрагиваются.
  Lifecycle-правило бакета по возрасту не используется: паузы между релизами
  достигают месяцев, и оно удалило бы живые ассеты. Автоматическая очистка
  внутри релиза — отдельное решение после релиза B (раздел 12).
- Проверка CDN на этапе 0 (решение R12) — мера свежести HTML, не условие
  удаления: кэширует ли CDN HTML и ответы с `no-cache` без `max-age`,
  фактический TTL на edge и в браузере, режим query-string ресурса
  (`ignoreQueryString`), заголовки bare-ключей `/js/*-config.js` на edge.
  Если CDN кэширует HTML — минимальная правка CDN с подтверждением владельца
  и записью в ADR: режим «как у источника» для HTML или шаг purge после
  прохода 3 без ожидания квитанции (purge у Yandex занимает до 15 минут и
  релиз не блокирует). Результаты проверки задают `min_age_days` процедуры
  очистки и правило её запуска. Политика CDN в `deploy.config.json` не
  моделируется; чтения настроек CDN и квитанций purge в релизном workflow
  нет.
- `deploy-lead-intake.test.cjs` проверяет три прохода и четыре команды
  `sync`, их порядок, guard до первой загрузки, отсутствие `--delete` в
  проходе 1, фильтры `js/*-config.js` в проходах 1 и 3, паритет `deploy:yc`
  с workflow по фильтрам и порядку, а не только по числу команд; запрещены
  `continue-on-error` и запуск следующих фаз через `if: always()`.
  Регулярка теста, использующая `--metadata-directive REPLACE` как границу
  команды, либо сохраняет флаг, либо переписывается в том же PR. Unit
  fixtures для guard: пустой каталог, отсутствующий маршрут и замена маршрута
  другим при сохранённом числе файлов. Тесты очистки: пустой список, объект
  моложе порога, объект из `dist`, расхождение ссылок живого HTML с `dist` →
  отказ; для `cleanup-assets.yml`: `timeout-minutes`, группа `deploy`,
  `execute` по умолчанию `false`.
- Dev после релиза A: `npm run dev` = сборка функций + `mock-server` на :3000
  + `astro dev --mode development --port 4173`. `watch-static.cjs` удаляется.
  `.env.development` читается только в этом режиме, `.env` и `.env.local` —
  всегда.
- Релизный конвейер не меняется: merge в `main` → staging → 8 тестов E2E →
  production → smoke. `skip_staging` для релизов A и B и для их revert не
  используется (решение R11). A, B, rollback и их повторы идут через общую
  concurrency-группу `deploy` с `cancel-in-progress: false`; ручной
  параллельный `deploy:yc` не является путём этих релизов. Новый порядок
  проходов впервые выходит подготовительным PR на legacy (этап 0), поэтому
  релизы A и B и их откаты workflow деплоя не меняют.

## 7. Этапы

### Этап 0. Условия входа, решения, инвентаризация

Условия входа в ветку A, все обязательны:

- **Staging восстановлен**: ручной `staging.yml` на текущем `main` прошёл
  деплой, smoke и 8 тестов E2E зелёным; релиз #80 выпущен обычным путём,
  production равен `main`. Нестабильность gateway и Cloud Functions с
  11 октября — следствие инцидента Yandex Cloud #2136 (раздел 3); условие
  выполняется после его закрытия, обращение в поддержку по этому поводу не
  требуется. До закрытия merge в `main` откладываются или идут с `[skip ci]`
  для документации.
- **Подготовительный PR защиты деплоя смержен и обкатан** (решение R14,
  вариант 2a): `chore(ci)` в `main` на legacy после восстановления staging и
  до открытия ветки A. Содержимое: проходы раздела 6 (проход 1 без `--delete`
  и с `--exclude "js/*-config.js"`, проход 3 из двух команд с no-cache),
  guard `check-routes.cjs --source public` и `check-build.cjs` в `deploy-site`
  до первого `sync`, `scripts/deploy.config.json` со значением `legacy`, то
  же в `deploy:yc`, переписанный `deploy-lead-intake.test.cjs`. PR проходит
  обычный релиз staging → E2E → production → smoke, затем обкатывается не
  менее чем одним обычным legacy-релизом (исправление GTM, imask) и одним
  ручным `staging.yml`. После релиза `HEAD` на `/js/*-config.js` через edge
  показывает `no-cache, must-revalidate` и свежий `Last-Modified`; если edge
  держит bare-ключ с `immutable`, делается одноразовый purge четырёх путей.
  Порядок PR этапа 0: защита → исправление GTM → imask → пометка в
  `AGENTS.md`. Ветка A наследует workflow и меняет только `profile`; откат A
  или B становится чистым `git revert` squash-коммита (раздел 9).
- **Пункт 1 PRJ-007 сделан на legacy**: `imask` отдаётся со своего хостинга с
  `defer`, форма отправляется и без маски. Ветка A наследует `src/vendor/imask`.
- **Удаление GTM на legacy исправлено отдельным PR до заморозки**: захват
  `stripGoogleTagManager` не пересекает закрывающий тег `script` или
  `noscript` и удаляет только GTM-блоки, их комментарии и явно заданные
  прилегающие пробелы. Unit-фикстура head клубной карты сохраняет bootstrap,
  оба icon-link, `og:image`, `twitter:image` и порядок соседей; страница без
  GTM остаётся побайтно прежней. При одинаковом окружении и фиксированном
  снимке фото production до/после совпадает побайтно; staging smoke и 8 E2E
  проходят обычный релиз из `main`. Исправленный SHA входит в закреплённую
  legacy-базу сравнения.
  Это подготовительная правка существующего сборщика, не дополнительный
  релиз миграции; строгий паритет A отсчитывается от исправленной базы.
- Снимок бакета `zvenfit-frontend` перед релизом A скриптом
  `scripts/snapshot-bucket.sh` (локальные ключи, `aws s3 sync` в каталог вне
  репозитория); versioning бакета не включается.
- Проверки инфраструктуры, результат в `knowledge-base/`: кэширует ли CDN
  HTML и ответы с `no-cache` без `max-age`, фактический TTL на edge и в
  браузере, режим query-string ресурса, заголовки bare-ключей
  `/js/*-config.js` на edge; права purge для deploy SA — только если purge
  выбран по R12; environment-bound OIDC принимает нерелизный workflow
  (прецедент `telegram-delivery-backup.yml`). Из результатов выводятся
  `min_age_days` и правило запуска очистки. Итог: `knowledge-base/cdn-runbook.md`;
  purge голых ключей конфигов выполнен 2026-10-26 полной очисткой ресурса,
  точечный purge по путям до edge не доходил.
  Лицензии Roadrage, экспортированного рантайма
  Webflow (`webflow.js`, `webflow.min.css`), `normalize` (MIT), `imask` (MIT),
  Roboto (Apache 2.0). Итог в ADR 002: у шрифта Road Rage (сборка «RUS BY
  LYAJKA») в метаданных «только для личного использования», коммерческая
  лицензия куплена владельцем, хранится вне репозитория.
- Проверить GitHub CodeQL default setup или существующий workflow и имя
  ожидаемого check: отсутствие результата не считается зелёной проверкой.
  Зафиксировать scope действующего SWS/ARL-правила и базовые измерения для B
  (раздел 13); значения секретов и Basic auth в отчёт не включаются.
- `scripts/inventory-bucket.cjs`: все ссылки на `storage.yandexcloud.net/zvenfit/v2`
  из HTML, CSS, `scripts/*.json` и сниппетов с размерами (HEAD-запросы),
  группировкой по типу и пометкой, что остаётся в бакете (`documents/`,
  `images/coaches/`).
- ADR `knowledge-base/decisions/002-astro-migration.md` с итогами R1–R15 и
  ссылкой на этот план; запись в `knowledge-base/_index.md`.
- PR в `main`: пометка в `AGENTS.md` о ветке A (правило о стеке остаётся),
  `docs/future/README.md`, `repo-manifest.json.project_ids` со всеми
  связанными карточками (сверить с Workspace, включая PRJ-009), карточка
  проекта в Workspace с зависимостью из PRJ-007. `.cursor/rules/*` на этом
  этапе не переписываются, только пометка.
- Правило координации с другими проектами на время ветки A: `functions/`
  свободны; `AGENTS.md`, `repo-manifest.json`, корневой `package.json`,
  `.github/` меняются маленькими PR в `main` (защита деплоя уже там), затем
  `git merge main` в ветку A;
  у конфигурации Dependabot один владелец.
- Заморозка `public/**`, `scripts/snippets/**`, `scripts/*.config.json`,
  `scripts/build-static.cjs` с открытия ветки A. Hotfix (решение R10): ошибка,
  мешающая оставить заявку, неверная цена или юридический текст; новые
  тренеры, акции и правки текстов ждут релиза A. Процедура hotfix: PR в
  `main` → обычный релиз legacy → `git merge main` в ветку A →
  обновление полного SHA legacy-базы в отчёте → страницы регенерируются
  конвертером с `--ref <SHA>` (страницы из `manual.json`
  переносятся вручную), правки CSS, скриптов, конфигов и сниппетов
  переносятся по diff → повтор compare-dist профиля текущего этапа
  (`a1` до полной конвертации, затем `a`). Перед итоговым merge всегда
  повторяется полный гейт. Окно
  заморозки по оценке раздела 14: 2–4 недели.

### Ветка A и структура PR

Работа идёт в ветке `feature/astro-release-a`. Внутрь неё стековые PR: A1
(каркас и проверки), A2a (конвертация и коллекция, с отчётом compare-dist и
`manual.json`), A2b (удаление legacy), A3 (документация). Итоговый PR из
ветки в `main` один, squash с типом `feat(frontend): …` (minor-версия
релиза). Предмет ревью владельца: отчёт compare-dist, `manual.json`, layout и
компоненты, переписанные проверки и workflow, а не тела 41 страницы.
Откат A или B — чистый `git revert` squash-коммита и обычный релиз по R11;
защита деплоя к этому моменту уже живёт в `main` и в diff релиза не входит.
Сразу после merge A revert-кандидат фактического SHA открывается как draft
PR и проходит `quality`, чтобы откат был готов заранее.

### Этап A1. Инструменты и проверки

- Пин `astro` 7.4.x, `@astrojs/check`, `prettier-plugin-astro`,
  `eslint-plugin-astro`; `engines.node >= 22.23.4` в корне, `.nvmrc` 22.23.4
  (astro 7.4.2 требует Node ≥ 22.23.4, проверено при установке 2026-10-27;
  редакция 5.1 исходила из 7.4.1 и 22.22),
  `check-latest: true` у `setup-node` в обоих workflow этого репозитория;
  `astro.config.mjs`, `tsconfig.json`, `.astro/` в `.gitignore`;
  `ASTRO_TELEMETRY_DISABLED=1` в скриптах `package.json`.
- На A1–A2a `astro.config.mjs` задаёт `publicDir: 'static'`: там только
  копии `images/zvenfit-logo.svg` и `images/club-card-logo.svg`. Legacy
  `public/` заморожен и не попадает в Astro-сборку; favicon/webclip до B
  остаются бакетными. `npm run build` переключается на команду Astro из
  раздела 6 уже в A1; legacy-сборка нужна только в worktree базы compare-dist.
- Layout и компоненты раздела 4; `Base.astro` воспроизводит бакетные адреса
  `normalize.min.css`, `webflow.min.css`, jQuery и `webflow.js?v=ASSET_VERSION`
  как у legacy-страниц; prop `data-zvenfit-page`.
- Эндпоинты конфигов и `maps-config` (нужны уже здесь: их требуют
  `check-staging-build` и smoke); проверка в `astro dev` и `astro build`, что
  `js/lead-config.js.ts` отдаётся по `/js/lead-config.js`.
- Конвертер и `manual.json`; `scripts/compare-dist.cjs` (раздел 8) с
  devDependency `parse5` и его job в `quality.yml` с `timeout-minutes`,
  `fetch-depth: 0`, явными SHA базы/кандидата и профилем; `npm ci` в
  одноразовых worktree. `github.base_ref` не выбирает базу сравнения.
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
  удаляются; `test:build` = `astro check` + `npm run build` +
  `check-routes --source astro` + `check-build`;
  `test-staging-build.cjs` вызывает `npm run build` с `NODE_ENV=staging` и
  сохраняет самообеспечение окружением; смысл staging-проверок сохраняется.
  Все проверки получают согласованный профиль раздела 8: только `a1`
  частичный, `a` и `b` полные. В A1 проверки содержимого страниц ограничены
  `/offer/`, `/privacy/`, `/payment-policy/`; sitemap сравнивается по этим
  маршрутам. Локальные ресурсы обязательны; ссылки на ещё не перенесённые
  страницы допустимы только из полного inventory legacy-базы. Проверка дублей
  между `public/` и `src/pages` включается в A2b. Итоговый PR в `main` и
  deploy-guard не могут использовать частичный профиль.
- `smoke-production.cjs` и его тест: `extractScriptUrl` принимает
  `/_astro/<имя>.<хэш>.js` для `lead-form.js`, `schedule.js`,
  `traffic-beacon.js` (имена гарантированы `?url`); конфиги по-прежнему
  `/js/*-config.js`.
- Деплой унаследован из `main` (подготовительный PR этапа 0): A1 ставит
  `profile: 'a'` в `deploy.config.json` и добавляет ветку guard
  `--source astro`; workflow, `deploy:yc` и тест деплоя не меняются.
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
  compare-dist профиля `a1` чист по трём юридическим страницам в production
  и staging; проверена обработка `noscript` внутри head компилятором Astro
  без переноса блока и изменения содержимого. Реальные имена файлов в
  `dist/_astro/` совпадают с ожиданиями smoke и `check-build`.

### Этап A2. Конвертация всех страниц, коллекция тренеров, вывод legacy

- A2a. Конвертер прогоняется по 41 файлу; ручные правки фиксируются в
  `manual.json`; каждая страница проходит компилятор Astro и проверку
  обратимости общих блоков. Все проверки переключаются на полный профиль `a`.
- Коллекция `trainers`: `slug`, `wfPage`, `name`, `nameDative`, `jobTitle`,
  `location`, `photoClass?`, `groups: [{ heading, itemsHtml[] }]`,
  `certificates?: [{ title, href, wNode? }]`, `certificatesSectionEmpty?`,
  `nextSlug`, `updated`, `sitemap: { changefreq, priority }`,
  `meta: { title, description }`,
  `fitbaseTrainerId?`. Шесть `w-node-*` — константы шаблона с суффиксом
  `wfPage.slice(-8)`. Дополнительные шесть id сертификатов Натальи Шулеповой
  сохраняются в `certificates[].wNode`; без них теряется паритет с CSS.
  Sitemap-значения всех 21 записей импортируются явно из исходного XML
  (у Ефима priority `0.65`, у остальных `0.6`); умолчания допустимы только
  для будущих записей. Одна схема и один шаблон на все 21 страницу;
  отклонения вне схемы фиксируются в `manual.json`. `StructuredData.astro`
  берёт `Person` из коллекции, блок
  `trainers` конфига удаляется.
- Скрипты через `?url` по разделу 4; `sitemap.xml.ts`, `robots.txt.ts`,
  снимок фото карт.
- A2b. `build-static.cjs`, `watch-static.cjs`, сниппеты, все `public/**/*.html`,
  `public/css`, `public/js`, `public/sitemap.xml`, `public/robots.txt`,
  `clean-css` из `package.json` удаляются; конфиги контента в `src/data/`.
  После проверки побайтного равенства двух SVG в `static/images/` и
  `public/images/` временный `static/` удаляется, override `publicDir`
  снимается; исходные `public/images/` остаются. Включается запрет дублирования
  страниц в `public/` и `src/pages`.
- Готово, когда: compare-dist чист по всем 41 страницам по контракту раздела 8
  (поведенческие исключения только из раздела 2), `test:build`,
  `test:build:staging`, `test:scripts`, `lint`
  зелёные, `dist/` не содержит `data-astro-cid-*`.

### Этап A3. Гейт, документация, релиз A

- Pre-merge гейт (раздел 8) пройден, отчёт локального прогона автотестов
  приложен к PR; revert-кандидат A собран до merge (сборка, `test:scripts`,
  `test:build`), сразу после merge A revert-кандидат фактического SHA открыт
  как draft PR и прошёл `quality`. Документация: README,
  `AGENTS.md` (раздел 14),
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

### PR очистки ассетов (после релиза A, до B)

- `scripts/cleanup-bucket-assets.cjs`, `.github/workflows/cleanup-assets.yml`,
  тесты на фикстурах и раздел «Очистка ассетов» в
  `knowledge-base/staging-runbook.md` (когда запускать, порог, dry-run, как
  читать summary, восстановление — повторный релиз текущего SHA через
  staging). `min_age_days` берётся из отчёта этапа 0; до отчёта только
  dry-run.
- Первый прогон — dry-run на staging и production; удаление впервые
  разрешается после закрытия окна отката релиза A.

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
  гейт профиля `b` пройден с новым SHA автотестов, релиз прошёл staging и
  E2E; dry-run очистки даёт цифру «объём сохранённых файлов» для отчёта. До
  merge приложены измерения раздела 13: added bytes, холодные установка/сборка/CI и оценка запросов/трафика.
  Проверена фактическая область SWS/ARL: same-origin CSS, JS и шрифты теперь
  идут через gateway. Локальный прогон ветки даёт оценку запросов за скользящие
  60 секунд; фактическая проверка staging выполняется после merge только из
  `main`, в рамках обычного гейта. Нужны отсутствие 429 от ARL в полном
  staging-прогоне и сохранение Basic auth/изоляции. Если проверка не проходит,
  production блокируется; ослабление защиты не является исправлением теста.
  Browser-проверки и измерения через Playwright принадлежат только autotests.

### После миграции, в рамках PRJ-007 и TODO

- Пункт 5: цели из кода, GTM убирается в `Analytics.astro`.
- Пункт 10: отказ от `webflow.js` и jQuery, свои выпадашки, слайдеры, табы;
  обновление пяти файлов автотестов с Webflow-классами; снятие исключений
  `max-lines` и Prettier для страниц. Инвентаризация 2026-10-26: выпадающее
  меню на 15 страницах, слайдеры на 9, табы на 3, 19 интеракций IX2 на 30
  страницах, обёртка формы на 1; 197 КБ `webflow.js` и 89 КБ jQuery на
  страницу. Делегированный submit-обработчик рантайма снимал блокировку
  кнопки формы и показывал блок ошибки во время запроса (исправлено в
  v3.0.9 остановкой события) — ещё один довод за отказ.
- Пункт 3: вид расписания на телефоне, при необходимости островок.
- TODO «Footer duplication» и «Navigation hierarchy»: один футер и одно меню.
- Ревизия клиентских скриптов (по ощущению владельца в 2,5 тысячах строк
  много лишнего): замер реально выполняемого кода (Coverage в DevTools на
  staging и прогон E2E), удаление мёртвых веток и дублей, перевод в модули и
  TypeScript по порядку из раздела 4.

## 8. Паритет и pre-merge гейт

`scripts/compare-dist.cjs` получает обязательные `--base-sha`,
`--candidate-sha` (полные 40 hex), `--profile a1|a|b`,
`--mode production|staging` и `--snapshot <path>`. Профиль и SHA базы явно
заданы в проверяемой конфигурации job `quality.yml` и отчёте PR; `main`,
`github.base_ref` и текущее dirty-дерево не подставляются по умолчанию.
Сборки выполняются в одноразовых worktree после `npm ci`, с фиксированным
снимком и явно заданными не секретными переменными. `--mode production`
сравнивает production-вывод базы и кандидата. `--mode staging` собирает
production и staging одного `--candidate-sha` и проверяет только
перечисленную ниже разницу режимов; production-эталон создаётся этим же
прогоном, произвольный готовый `dist` не принимается. Inventory профиля
читается из исходников указанной базы, повторно собирать её в staging-прогоне
не требуется. Оба прогона обязательны: проверка режимов не заменяет
паритет с базой. Для A база уже содержит исправление GTM из этапа 0.

| Профиль | База и охват |
| --- | --- |
| `a1` | Закреплённый legacy SHA; ровно `/offer/`, `/privacy/`, `/payment-policy/`. Sitemap сравнивается по этим трём URL, ожидаемые ссылки на остальные страницы проверяются по полному inventory базы |
| `a` | Закреплённый legacy SHA; полный набор маршрутов и sitemap, на старте 41 HTML и 40 URL. После каждого hotfix SHA обновляется и итоговый полный гейт повторяется |
| `b` | Явный SHA принятого Astro `main`, от которого готовится B; полный набор маршрутов. После каждого изменения `main` во время ветки B база обновляется, изменения переносятся в B и полный гейт повторяется. Это уже не legacy-сборка |

В итоговых PR в `main` разрешены только полные профили `a` и `b`.
Частичный `a1` используется только для внутреннего PR A1. Проверки сборки
и staging получают тот же профиль, а не независимые списки `--pages`.

Общий снимок — тот же `src/data/map-photos.json`, который используется
кандидатом при деплое, с ключами и массивами URL формата `locationPhotos`.
Для legacy-базы harness в одноразовом worktree заменяет только поле
`scripts/maps.config.json.locationPhotos` этим снимком и проверяет равенство
всех остальных полей коммиту базы. Только дочерний процесс legacy build
получает первым в `PATH` каталог с `curl`-заглушкой, возвращающей код 22:
сборщик использует детерминированный fallback вместо сети. Исходники в
основных checkout не меняются; единственный fixture override фиксируется
в отчёте вместе с SHA-256 снимка и путём harness. Для Astro-базы B обе сборки
читают тот же снимок. Обновление снимка во время сравнения и подмена уже
собранного `maps-config.js` запрещены.

Ожидаемая разница candidate production → candidate staging:

- отсутствуют только блоки сторонней аналитики и GTM из обоих размещений
  `Analytics.astro`, включая их `noscript` и служебные комментарии GTM;
  UTM, бикон, Webflow bootstrap, icon-link и остальные meta сохраняются;
- robots meta становится единственным `noindex, nofollow`, включая 404;
  `robots.txt` побайтно равен `User-agent: *\nDisallow: /\n`;
- только значения API URL в `lead-config.js`, `schedule-config.js`,
  `traffic-config.js` заменены на заданные staging-адреса. Пути четырёх
  конфигов и остальное содержимое не меняются; `maps-config.js` при одинаковых
  снимке и ключе совпадает побайтно.

Это фиксированные правила профиля, а не сравнение с ошибочным staging-выводом
старого SHA. Пробелы на границах удалённых блоков описываются точными
правилами ниже; общий пропуск whitespace или всех комментариев недопустим.
Любая другая разница между режимами валит проверку. Исправленный legacy
staging уже прошёл релизный гейт на этапе 0, до начала A.

Правила сравнения:

- HTML разбирается одним парсером `parse5` с `scriptingEnabled: true` и
  `sourceCodeLocationInfo: true`; сравниваются doctype, структура и порядок
  узлов, все имена и значения атрибутов, текст. Порядок атрибутов неважен,
  порядок и значения классов сохраняются. Это включает `aria-*`, `rel`,
  `target`, `style`, все `data-*`, `defer`, `async`, `type`, `nomodule`,
  head-метаданные и фактическое место аналитики в head/body. Новые дубли id
  и пропавшие узлы — ошибка. У `noscript` сохраняется исходное содержимое:
  [parse5 при включённом scripting разбирает его как текст](https://parse5.js.org/interfaces/parse5.ParserOptions.html).
- По умолчанию текстовые пробелы сохраняются. Схлопывание ASCII
  `[ \t\r\n]+` допустимо только в явно перечисленных правилах профиля для
  узлов, где оно не меняет отображение; общее `\s+` и удаление всех
  межтеговых пробелов запрещены. NBSP остаётся значимым, в том числе после
  разбора `&nbsp;`. Содержимое `pre`, `textarea`, `script`, `style`,
  `noscript` такой нормализации не подвергается. Обычные комментарии,
  которые компилятор убирает, также требуют явного правила, а не общего
  игнорирования всех комментариев.
- Inline JS и переносимые классические JS сравниваются побайтно; JSON-LD —
  как разобранный JSON. Если A1 выявит переформатирование inline JS самим
  компилятором, альтернативный JS-aware алгоритм требует отдельного
  обоснования и тестов: он сохраняет AST, литералы, regex, шаблоны и значимые
  переводы строк для ASI. Простого сравнения токенов без переводов строк или
  схлопывания пробелов недостаточно. Наличие идентификатора счётчика не
  заменяет проверку содержимого script/noscript.
- URL нормализуются только по явной таблице конкретных ресурсов. Для A:
  свои `/js/<имя>.js?v=` и CSS ↔ соответствующие `_astro/`-файлы; у четырёх
  конфигов убирается `?v=`; бакетные адреса сохраняются. Существование целевых
  ресурсов и порядок подключений проверяются. Для B отдельная таблица
  описывает перенос вендоров, шрифтов, изображений, версионированных favicon
  и webclip, включая ссылки из CSS и конфигов. Общая маскировка любых хэшей
  или query-параметров запрещена; изменения текста, атрибутов и логики под
  видом переезда URL не допускаются.
- `sitemap.xml` сравнивается по множеству `loc` и всем полям `lastmod`,
  `changefreq`, `priority`; `robots.txt` — побайтно. Дополнительно сверяются
  множества маршрутов исходников, dist и sitemap по разделу 6.

Allow-list задаёт профиль/режим, маршрут, точный узел или поле, ожидаемые
before/after, число совпадений и причину. Неописанное расхождение, неверное
число совпадений или неиспользованное правило в его области действия валят
проверку. Разрешённый `defer` у Webflow на `/offer/` записывается таким
правилом. Исключения не отключают проверку страницы или класса атрибутов.
После релиза B job в `quality.yml` снимается, скрипт остаётся инструментом.

Pre-merge гейт для итогового PR A и для PR B, выполняет агент и прикладывает
отчёт комментарием к PR (SHA обоих репозиториев, версия Playwright, команда и
окружение сборки, итог reporter):

1. `npm run lint`, `npm run test:scripts`, `npm run test:build`,
   `npm run test:build:staging`; обязательные отдельные compare-dist в
   `production` и `staging` полным профилем, без расхождений вне allow-list.
   Production-сравнение с базой включает весь код аналитики и noscript,
   staging-прогон проверяет дельту режимов того же кандидата; браузерный
   перехват запросов аналитики не является обязательным дополнительным гейтом.
2. Сборка ветки `NODE_ENV=development npm run build`; в `zvenfit-autotests`
   `git checkout <SHA из main.yml>`, `npm ci`, `npx playwright install
   chromium`, `ZVENFIT_FRONTEND_PATH=<checkout ветки> npm run check` (11 спек,
   staging исключён конфигом; порт 43987 свободен).
3. При красных тестах: регрессия фронтенда — чинится в ветке; устаревшее
   допущение теста (путь, `?v=`, класс) — сначала PR в `zvenfit-autotests`,
   новый пин SHA отдельным PR здесь, повтор гейта.
4. `quality` и проверенный на этапе 0 CodeQL check зелёные. Отчёт также
   содержит SHA базы сравнения, профиль, оба режима, digest снимка и полный
   список применённых исключений. Значения секретов в отчёт не попадают.

Staging и 8 тестов E2E после merge — релизный гейт, а не критерий готовности.

## 9. Откат и остановка

- Откат релиза A или B — чистый `git revert` squash-коммита (допустима кнопка
  Revert на GitHub) и обычный релиз staging → E2E → production → smoke по
  R11, без `skip_staging`. Защита деплоя (проходы раздела 6, guard,
  `deploy.config.json`, тесты) к моменту релиза A уже живёт в `main`
  (подготовительный PR этапа 0, R14), поэтому revert физически не может её
  убрать, а любой PR с возвратом `--delete` в проход ассетов падает на
  контрактном тесте в `quality`.
- Конфликты revert: modify/delete в `src/` при hotfix, сделанном после A, —
  принять удаление и перенести hotfix в `public/` по diff; корневые
  `package.json` и lockfile — версии до A целиком с повторным наложением
  нужных обновлений; функции и более поздние hotfix в `functions/`
  сохраняются. Откат B тем же revert возвращает `ASSET_VERSION` в сборку и
  окружение. Для отката A `check-routes.cjs --source public` и legacy
  `check-build.cjs` возвращаются самим revert.
- Первый проход восстановит нужные ресурсы из проверенного артефакта до
  переключения HTML, даже если их раньше удалила ручная очистка; отдельный
  журнал поколений не требуется. Очистку не запускать, пока открыто окно
  отката: TTL HTML после последнего релиза или отката.
- Рецепт отката записывается в `knowledge-base/staging-runbook.md` (раздел
  «Откат фронтенда») со ссылкой из `docs/launch-checklist.md`. Revert-кандидат
  A собирается до merge (сборка, `test:scripts`, `test:build`), а сразу после
  merge A revert-кандидат фактического SHA открывается draft PR и проходит
  `quality`; перед реальным откатом гейт R8 повторяется для его SHA.
- Время отката зависит от конвейера, обещание «около 10 минут» не является
  гарантией. При ошибке любого прохода последующие не выполняются; повтор
  или новый rollback PR проходит тот же путь, прямой откат production не
  используется.
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
| `s3 sync --delete` удаляет ассеты при живом старом HTML | в релизе `--delete` только у HTML и crawl-файлов в их фильтрах; очистка `_astro/*` вне релиза: dry-run по умолчанию, порог возраста не меньше TTL HTML, «не в dist», предусловие по живому HTML; защита выпущена до A отдельным PR, revert её не затрагивает |
| Очистка параллельно с релизом или после упавшего релиза | `concurrency: group: deploy` у `cleanup-assets.yml`, порог возраста, предусловие равенства ссылок живого HTML и `dist` |
| Тихая потеря аналитики на перенесённой странице | обязательный production compare содержимого, атрибутов и размещения script/noscript, детекторы 30 минут, сверка Метрики |
| Длинная ветка A и правки `public/` на `main` | заморозка, процедура hotfix, обновление явного SHA базы и повтор полного гейта |
| `max-lines` и Prettier по телам страниц | исключения в ESLint, Prettier не запускается по страницам |
| E2E меняют условия, когда вендорные ассеты уходят с бакета | этап B1 до релиза B, пин SHA |
| CI автотестов собирает фронтенд сам | `check-latest` для Node там до релиза A, проверка после merge |
| Favicon и webclip под `immutable` без хэша | версия в имени файла |
| Персональные данные в публичном репозитории | сертификаты и фото тренеров остаются в бакете (R4, R9); `secret_scan.py` и просмотр партии перед коммитом |
| Рост зависимостей, sharp с нативными бинарниками | `npm ci` в CI, Dependabot version updates, CodeQL без изменений |
| Staging нестабилен | условие входа этапа 0, релиз без `skip_staging` |
| Перенос ресурсов на same-origin увеличивает запросы к staging gateway и ARL | оценка до merge B и фактический staging-гейт из main; измерения запросов, 429, времени CI и расходов |

## 11. Решения

Приняты владельцем 2026-10-19, 2026-10-21, 2026-10-22 и 2026-10-26.
Канонический список с датами и следствиями — ADR
`knowledge-base/decisions/002-astro-migration.md`; здесь кратко:

- **R1. Идём в миграцию.**
- **R2. Два релиза**: A — сборка и страницы, B — ассеты.
- **R3. Конфиги API** — эндпоинты на прежних путях `/js/*-config.js` плюс
  no-cache правило в деплое (не позднее подготовительного PR до ветки A,
  R14).
- **R4. Сертификаты и дипломы тренеров** остаются в бакете.
- **R5. Картинки, шрифты и вендорные файлы** — оптимизированные в
  репозиторий, оригиналы в бакете как архив.
- **R6. Строгий паритет** в релизе A, пункты 6, 8, 11 отдельными PR после.
- **R7. Деплой**: ассеты без `--delete` → crawl-файлы → HTML и конфиги →
  очистка. Это порядок шагов, а не место исполнения: очистка — отдельная
  ручная процедура (R13); применяется не позднее подготовительного PR до
  ветки A (R14).
- **R8. Гейт E2E**: полный набор локально до merge, 8 тестов в релизе.
- **R9. Фото тренеров** не попадают в git: оптимизированные копии в бакет с
  `Cache-Control`.
- **R10. Hotfix на время ветки A**: заявки, цены, юридические тексты;
  остальное ждёт релиза A.
- **R11. Revert** только через staging, без `skip_staging`.
- **R12. CDN**: при кэше HTML допускается минимальная правка CDN с
  подтверждением владельца и записью в ADR; это мера свежести HTML, не
  условие удаления.
- **R13. Очистка устаревших ассетов** (2026-10-22) — вне релизного workflow:
  отдельный `workflow_dispatch` с dry-run по умолчанию и механическим guard;
  автоматическая очистка в релизе — отдельное решение после B.
- **R14. Срок R3 и R7** (2026-10-22) — не позднее подготовительного PR в
  `main` до ветки A; откат A и B — чистый `git revert`.
- **R15. `--delete` в проходах 2 и 3** (2026-10-22) остаётся внутри их
  фильтров; снимается только с прохода ассетов.
- **R16. Ключ кэша CDN** (2026-10-26) — после релиза B параметр `v`
  убирается из ключа кэша; до того whitelist остаётся.

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
(пункт 7 ревью), настройки CDN сверх минимальной правки по R12,
автоматическая очистка ассетов в релизном workflow (отдельное решение после
релиза B по данным инвентаризации и dry-run очистки).

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
- Для B в один отчёт ревью: добавленные байты оптимизированных ассетов и
  рост Git, холодные `npm ci`/сборка/проверки и общий CI относительно этапа 0,
  число запросов gateway за прогон и пиковые скользящие 60 секунд, трафик,
  429 и оценка ежемесячной разницы расходов Yandex Cloud. У оценки указаны
  объём нагрузки, регион, дата и источник тарифа, а не выдуманная фиксированная
  цена; объём накопленных `_astro/*` берётся из summary dry-run очистки,
  расчёт по действующему прайс-листу с датой и регионом.
  Во время локальной оценки учитывается отключённый HTTP cache при
  `page.route` в autotests. Владелец получает сводку и отклонения; технические
  прогоны и подготовку отчёта выполняет агент. Лимиты CI и существующая защита
  staging должны выдерживать обычный релиз без ручных обходов.

## 14. Оценка и документация

Рабочие дни агентной разработки с ревью владельца, без ожиданий релизов, с
поправкой 20–30 % по совету первого независимого ревью. Восстановление
staging не оценивается, это отдельная задача.

| Этап | Оценка |
| --- | --- |
| 0. Условия входа, подготовительный PR защиты деплоя, инвентаризация, ADR, карточка, пункт 1 PRJ-007 | 3–5 |
| A1. Инструменты, конвертер, переписанные проверки | 3–4 |
| A2. Конвертация 41 страницы, коллекция тренеров, вывод legacy | 4–6 |
| A3. Гейт, документация, релиз A | 1–2 |
| PR очистки ассетов после A | 0,5–1 |
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
ведутся в карточке проекта Workspace, итоги решений — в ADR
`knowledge-base/decisions/002-astro-migration.md`, со взаимными ссылками и
без дублирования текста.
