# План миграции фронтенда на Astro

Статус: discovery-план, составлен 2026-10-04, для реализации не согласован.
Ветка: `docs/astro-migration-plan`. Решение о стеке и порядок работ обсуждаются
с владельцем по пунктам; после согласования план получает карточку проекта в
Personal AI Workspace и ссылку из PRJ-007 «Доработки фронтенда сайта».

Связанные записи: [`TODO.md`](../../TODO.md) («Footer duplication» отложен «до
перехода на шаблонизатор», «Auto-generate sitemap», «Navigation hierarchy»),
правило о стеке в [`AGENTS.md`](../../AGENTS.md), пункты 2, 4, 5, 6, 8, 10 и
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

Снято с репозитория 2026-10-04.

- Страницы: 40 `index.html` плюс `404.html`, 827 KB исходного HTML. Меню:
  `menu1` на главной, `menu2` на 9 страницах услуг, `menu3` на 9 (юридические,
  контакты, расписание и другие), `menu2-coach` на 21 странице тренеров.
  Футеры трёх поколений: `section-3`/`section-4` с картой на 6 страницах,
  `footer-grid`/`footer-locations` на 5, `footer-location` на 10, на остальных
  `divider footer` и встроенная карта. 35 страниц несут `data-wf-page` и
  `data-wf-site` на `<html>`, 34 — комментарий Webflow «Last Published».
- `build-static.cjs` (1027 строк) на каждую страницу по порядку: strip GTM на
  staging → замена iframe карты на регион из `maps.config.json` → сниппеты
  head (аналитика кроме staging, UTM) → Open Graph из title и description →
  JSON-LD из `structured-data.config.json` (полный граф на `/` и
  `/contacts/platforms/`) → бейджи приложений из сниппетов и
  `app-links.config.json` (без футерного блока на `/contacts/platforms/` и
  `/promos/apps/`) → скрипты карт → трафик-бикон (кроме 404) → `noindex` на
  staging → класс `slash-prefix` → cache-bust `?v=ASSET_VERSION`. Затем
  подстановка `LEAD_API_URL`, `SCHEDULE_API_URL`, `TRAFFIC_API_URL` в
  `js/*-config.js`, запись `maps-config.js`, минификация CSS, фото организаций
  с Яндекс Карт по сети с fallback на `locationPhotos`, `robots.txt` для
  staging.
- Картинки. В бакете `zvenfit/v2` 122 файла без `Cache-Control`. Из CSS
  используются 81 как фоновые изображения (`background-image`), из HTML 37
  файлов: favicon и webclip в `<link>` (82 ссылки), сертификаты тренеров в
  `<a href>` (34), `og:image` (2). На всём сайте один тег `<img>`. Вывод:
  компонент `<Image>` Astro почти не применим к текущей разметке; выигрыш по
  весу даёт отдельный шаг на sharp с переписыванием CSS, а Astro нужен для
  слоя шаблонов и данных. Форматы: PNG 100 ссылок, WebP 58, JPEG 49, SVG 5,
  GIF 1.
- Шрифты: Roadrage как `roadrage.ttf` 1,2 МБ из бакета через `@font-face`;
  Roboto и Roboto Condensed через `@import` с `fonts.bunny.net`, то есть
  внешняя зависимость на каждой странице. Вендорные файлы из бакета:
  `normalize.min.css`, `webflow.min.css`, `jquery-3.5.1.min.js`, `webflow.js`.
- Клиентский JS: 2546 строк, `schedule.js` 1272, `yandex-map.js` 768,
  `utm-attribution.js` 230, `lead-form.js` 194, остальное мелочь. jQuery в
  нашем коде не используется, только рантаймом Webflow: выпадашки на 14
  страницах, слайдеры на 9, табы на 3, интеракции `data-w-id` на 30.
- E2E: 12 спек; 27 локаторов по классам, из них Webflow-специфичные
  `.w-dropdown-list`, `.w-dropdown-toggle`, `.w-slider`, `.section-3`,
  `.section-4`, `.div-block-6` в `tests/contracts/responsive-layout.spec.ts`,
  `tests/features/ui-controls.spec.ts`, `tests/features/club-card.spec.ts`,
  `tests/support/interaction-registry.ts`, `pages/training-prices.page.ts`.
  Классы и `id` при миграции сохраняются, поэтому автотесты меняются только
  на этапе отказа от рантайма Webflow.
- Проверки: `check-webflow-layout.cjs` требует валидный `data-wf-page`, ≥ 90 %
  `w-node-*` покрыты CSS, нет дублей `id`; `check-build.cjs` проверяет
  `webflow.js` с CDN, `maps-config.js`, форму и клубную карту;
  `check-staging-build.cjs` проверяет `noindex`, отсутствие аналитики и
  staging-адреса API. Контракт проверок для Workspace: `project-checks.json`.

## 4. Целевая структура

```
astro.config.mjs            site, trailingSlash, compressHTML: false, publicDir
src/
  layouts/Base.astro        <html lang data-wf-page data-wf-site>, head, CSS, скрипты
  components/
    Menu.astro              variant: home | service | coach | plain  (menu1/2/2-coach/3)
    Footer.astro            variant по поколению футера, с MapRegion
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
  content/trainers/*.json   21 запись: slug, имя, роль, направления, сертификаты,
                            meta, позже fitbaseTrainerId
  data/                     app-links, maps, structured-data, map-photos snapshot
  scripts/                  schedule.js, lead-form.js, yandex-map.js, utm, beacon
  styles/                   zvenfit.webflow.css, klubnaya-karta.v1.css, fonts.css
  assets/images/, assets/fonts/
static/ (на время миграции) → public/ (после)   favicon, webclip, прочее как есть
scripts/migrate/html-to-astro.cjs   одноразовый конвертер, удаляется в конце
scripts/compare-dist.cjs            проверка паритета
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
| `?v=ASSET_VERSION` | хэши Vite в `_astro/`, переменная исчезает |
| минификация CSS | Vite при импорте стилей |
| `js/*-config.js` с подстановкой URL | `<script is:inline define:vars>` из `PUBLIC_*`-переменных окружения или эндпоинты `*.js.ts` |
| strip GTM, `noindex`, `robots.txt` для staging | ветвление по `import.meta.env` в `Analytics.astro`, layout и `robots.txt.ts` |
| фото организаций с Яндекс Карт при сборке | prebuild-скрипт пишет снимок в `src/data/map-photos.json` (решение D4) |
| `maps-config.js` | генерируется эндпоинтом или inline-скриптом из данных |
| `slash-prefix` | применяется один раз при конвертации, в сборке не нужен |
| ручной `sitemap.xml` | `src/pages/sitemap.xml.ts`: имя файла и `robots.txt` не меняются; интеграция `@astrojs/sitemap` не подходит, она пишет `sitemap-index.xml` |

## 6. Переходный режим сборки

Страницы переезжают партиями, сайт собирается двумя сборщиками до этапа 6.

1. `node scripts/build-static.cjs` как сейчас: очищает `dist/`, собирает
   страницы, оставшиеся в `public/`, копирует `css/`, `js/`, `robots.txt`,
   `sitemap.xml`.
2. `astro build` с `outDir: 'dist'`, `vite.build.emptyOutDir: false` и
   `publicDir: 'static'`, чтобы Astro не копировал `public/` целиком. Страница,
   перенесённая в `src/pages`, удаляется из `public/`, и legacy-сборка сама
   перестаёт её видеть. Пересечений по путям нет.
3. `npm run build` вызывает оба шага; `test:build` и `test:build:staging`
   получают оба вывода; `check-build.cjs` и `check-staging-build.cjs`
   проверяют `dist/` как раньше.
4. Dev: `astro dev` на :4321 для перенесённых страниц рядом с `mock-server`
   на :3000; `dev:watch` без изменений для остальных. После этапа 6 остаётся
   только `astro dev`.

## 7. Этапы и PR

Каждый PR проходит обычный релиз и становится production-выкладкой, поэтому
партии должны быть самодостаточными; откат — revert PR.

### Этап 0. Решение и правило

- Согласовать этот план и решения из раздела 10.
- PR: правило в `AGENTS.md` (текст в разделе 12), запись в `docs/future/README.md`,
  карточка проекта в Workspace, PRJ-007 получает зависимость.

### Этап 1. Каркас и первая партия

- Установить `astro`, `sharp` опционально позже; `astro.config.mjs`; `Base.astro`,
  `Menu.astro` (пока вариант `plain`), `Footer.astro` для нужного поколения,
  `MapRegion`, `Analytics`, `UtmHead`, `OpenGraph`, `StructuredData`,
  `TrafficBeacon`.
- Конвертер `scripts/migrate/html-to-astro.cjs`: вынимает title, description,
  canonical, `data-wf-page`, вариант меню и футера, флаги карт и CSS страницы
  во frontmatter; тело страницы переносит как есть; inline-скриптам ставит
  `is:inline`, экранирует фигурные скобки; результат правится руками.
- `scripts/compare-dist.cjs` (раздел 8) и его запуск в `quality.yml`.
- Первая партия: `/privacy/`, `/offer/`, `/payment-policy/`,
  `/contacts/platforms/` (все на `menu3`, простая разметка, карта в футере).
- Готово, когда: паритет по четырём страницам без расхождений, кроме
  согласованного списка (порядок атрибутов, хэши ресурсов), `test:build` и
  `test:build:staging` зелёные, релиз прошёл staging и E2E.

### Этап 2. Тренеры

- `content.config.ts` с коллекцией `trainers`, 21 JSON-запись, страница
  `trenery/[slug].astro` и `/trenery/` с `coaches-show-more.js`. Схема
  включает поля под будущий `fitbaseTrainerId` (необязательное).
- Паритет по 22 страницам. Разные наборы блоков у тренеров (сертификаты,
  слайдер документов) выражаются полями схемы, а не отдельными шаблонами.
- Следом отдельный PR: пункт 6 ревью (H1 с ФИО, title и description) в одном
  шаблоне.

### Этап 3. Услуги, главная, промо, клубная карта, расписание, форма

Три партии по 4–6 страниц: (а) `trenazhernyj-zal/*`, `personalnye-trenirovki`,
`parnye-trenirovki`; (б) `pilates-na-reformere/*`, `gruppovye-trenirovki`,
`klubnaya-karta`, `promos/*`; (в) главная, `raspisanie`, `forma-dlya-zayavki`,
`404`. Варианты меню `service`, `home`, маркеры `data-zvenfit-page`,
скрипты страниц подключаются как внешние файлы без изменений.
Следом отдельные PR: пункт 8 (H1 главной) и пункт 11 (уровни заголовков).

### Этап 4. Скрипты и конфигурация

- `public/js/*.js` переезжают в `src/scripts/` и подключаются через Vite:
  хэширование вместо `ASSET_VERSION`, без изменения кода скриптов.
- API-адреса из `PUBLIC_LEAD_API_URL`, `PUBLIC_SCHEDULE_API_URL`,
  `PUBLIC_TRAFFIC_API_URL`; `check-staging-build.cjs` проверяет их в HTML
  страниц формы и расписания вместо файлов `*-config.js`.
- `.env.development` читается Astro напрямую; `mock-server` без изменений.

### Этап 5. Ассеты и кэш (пункты 2 и 4 ревью, решение D1)

- Инвентаризация бакета скриптом: список 122 файлов, где используются, размер.
- Скрипт `scripts/optimize-images.cjs` на sharp: исходники в
  `src/assets/images/`, для фоновых картинок генерирует WebP нужных ширин
  (по фактической ширине карточек), CSS переписывается на локальные пути;
  `image-set()` там, где нужен fallback. Оригиналы PNG крупных фото не
  публикуются.
- Roadrage в WOFF2 с `font-display`, Roboto самохостинг вместо `fonts.bunny.net`,
  вендорные `normalize.min.css`, `webflow.min.css`, jQuery и `webflow.js`
  локально через Vite. Все попадают в `_astro/` с хэшем и `immutable`.
- Favicon и webclip в `static/`; сертификаты тренеров как файлы в
  `src/assets/documents/`, ссылки через импорт, чтобы получить хэш и кэш.
- Готово, когда: главная на телефоне ≤ 1,5 МБ (замер до и после в карточку
  проекта), ни одной ссылки на `storage.yandexcloud.net/zvenfit/v2` в `dist/`,
  E2E зелёные. Бакет остаётся как архив до отдельного решения.

### Этап 6. Вывод legacy-сборки

- Удалить `build-static.cjs`, `watch-static.cjs`, сниппеты, конвертер;
  `publicDir` обратно в `public/`; конфиги в `src/data/`.
- Проверки: дубли `id` и покрытие `w-node-*` переносятся на `dist/` в
  `check-build.cjs`; `check-webflow-layout.cjs` и `webflow-layout.test.cjs`
  удаляются; `project-checks.json`, `package.json`, `quality.yml`,
  `_deploy-environment.yml`, README, AGENTS.md, `knowledge-base/` обновлены.
- `sitemap.xml.ts` закрывает TODO «Auto-generate sitemap».

### После миграции, в рамках PRJ-007

- Пункт 5: цели из кода, GTM убирается в `Analytics.astro`.
- Пункт 10: отказ от `webflow.js` и jQuery, свои выпадашки, слайдеры, табы;
  обновление пяти файлов автотестов с Webflow-классами.
- Пункт 3: вид расписания на телефоне, при необходимости островок.
- TODO «Footer duplication» и «Navigation hierarchy»: один футер и одно меню.

## 8. Паритет и проверки

`scripts/compare-dist.cjs` сравнивает для каждой перенесённой страницы вывод
legacy-сборки базовой ветки и вывод Astro текущей ветки:

- `<title>`, description, canonical, robots, Open Graph и Twitter meta;
- JSON-LD как разобранный JSON;
- `data-wf-page`, `data-wf-site`, `lang`;
- последовательность заголовков с текстом; множество `id`; все `href`
  внутренних ссылок; `src`/`href` скриптов и стилей без хэшей и `?v=`;
- видимый текст с нормализованными пробелами.

Запуск в `quality.yml`: собрать `origin/main` legacy-сборкой во временный
каталог, собрать PR, сравнить страницы из `scripts/migrate/pages.json`.
Локально та же команда. Расхождения допускаются только по явному списку.

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
| Порядок CSS: normalize → webflow → zvenfit | явный порядок импортов в `Base.astro`, проверка в compare-dist |
| Переписывание фонов в CSS ломает отображение | этап 5 отдельными PR по группам картинок, проверка на staging и E2E |
| Рост зависимостей, sharp с нативными бинарниками | `npm ci` в CI, Dependabot (D3), CodeQL без изменений |
| Каждый PR — релиз в production | партии самодостаточны, откат через revert |
| Параллельная работа над страницами в `public/` | перенесённые страницы правятся только в `src/pages`; список в `pages.json` |

## 10. Решения владельца

- **D1.** Картинки, шрифты и вендорные файлы переезжают в репозиторий
  (пункт 1 открытых вопросов PRJ-007). План исходит из «да».
- **D2.** Принцип паритета: миграция не меняет разметку, унификация меню и
  футеров отдельными PR после. Альтернатива: объединять и принимать больший
  объём ручной проверки.
- **D3.** Включить Dependabot для корневого `package.json` и функций.
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
| 1. Каркас, паритет, 4 страницы | 2–3 |
| 2. Тренеры и коллекция | 2–3 |
| 3. Три партии страниц | 3–5 |
| 4. Скрипты и конфигурация | 1–2 |
| 5. Ассеты и кэш | 2–4 |
| 6. Вывод legacy и документация | 1–2 |

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
