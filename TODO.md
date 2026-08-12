# ZvenFit — backlog

Приоритет: **Critical → High → Medium → Infra**. UI audit: `ui-ux-pro-max` (2026-06-30).

Agent guide: [`AGENTS.md`](AGENTS.md)

---

## Critical (a11y / mobile)

- [x] **App badges — touch targets**
  Badges use ≥44px hit area, ≥8px gaps and wrap on narrow screens.

- [x] **Global `:focus-visible`**
  Shared focus ring for links, buttons, form controls and custom focusable elements.

- [x] **`prefers-reduced-motion`**
  При системной настройке уменьшения движения отключается анимированный `grain.gif`; основные UI transitions и skeleton-анимации также сокращаются.

---

## High (UX / maintainability)

- [x] **Run build-static before deploy**
  Production workflow запускает `npm run build` до загрузки сайта.

- [ ] **Footer duplication**  
  `section-4` (desktop) + `section-3` (mobile): duplicate map + contacts + 2× Yandex iframe.  
  Отложено до перехода на шаблонизатор; затем вынести в единый template partial.

- [ ] **Homepage social proof**  
  Testimonials block on `/` (reviews exist on service pages only).

- [ ] **Navigation hierarchy**  
  Service pages: primary nav vs secondary (dropdown «связь с нами»).

- [ ] **Responsive body padding**  
  `.body` 60px horizontal — verify tablet/mobile, watch `h1-main` overflow.

---

## Medium (polish / SEO)

- [ ] **Auto-generate sitemap** from `public/**/*.html` (manual `sitemap.xml` drifts).

- [x] **Structured data — Organization logo**
  Organization JSON-LD использует отдельный квадратный брендовый logo asset 512×512.

- [ ] **Base typography**  
  `body` 14px/1.43 → prefer 16px/1.5 on mobile. Arial in fallback stack.

- [ ] **Отзывы для группового зала** (`/gruppovye-trenirovki/`)  
  Секция `#reviews` и пункт меню скрыты CSS (`data-wf-page="69b540f958c9c44d220bcf1a"`) — сейчас там копипаста с тренажёрного. Нужны реальные отзывы про групповые → заменить контент, убрать hide-rule.

- [x] **Lead form (`forma-dlya-zayavki`)**
  Native select, уникальные labels, `method="post"`, aria-live feedback и понятные ошибки.

- [x] **App badges polish**
  `cursor: pointer`, `:focus-visible`, footer `flex-wrap` on small widths.

- [x] **Map accessibility** — build заменяет iframe на region с `role` и `aria-label`.

- [ ] **Purple accent contrast** — `#b949ff` on `#1a1a1a` for small text (WCAG AA).

---

## Infra / DX

- [x] `AGENTS.md` + `.cursor/rules/` for agent context
- [x] `.env.example` for local dev
- [x] `npm run lint:public` — lint `public/js` + `functions`
- [x] `npm run test:build` — build smoke check
- [x] Durable lead storage in YDB + Telegram retry timer
- [x] Lead function unit tests in CI
- [x] Production smoke test after deploy without creating a real lead (`npm run smoke:production`)
- [x] Consolidate `README.md` / `docs/setup.md` overlap (setup stays detailed, README — index)

---

## Done

- [x] Distinctive visual identity (not generic AI layout)
- [x] SEO: meta, canonical, `lang="ru"`
- [x] OG + Twitter meta at build
- [x] JSON-LD: `WebSite`; `Offer`/`ItemList` on promos
- [x] `/promos/` in sitemap; nav «акции»
- [x] CDN preconnect, lazy images on badges
- [x] Form labels, tel autocomplete, consent
- [x] Reviews on service pages
- [x] Telegram token moved to Cloud Function (not in HTML)

---

## Pre-release checklist

- [x] Touch targets ≥44px @ 375px
- [x] Focus visible on all interactives
- [ ] Footer/muted text contrast AA
- [x] Test `prefers-reduced-motion: reduce`
- [x] App badges present after build-static
- [x] Form IDs and a11y validated
- [x] Built maps expose an accessible region label

---

## Deferred / by signal

- **Footer link contrast** — сознательно не меняем текущий `#727272` в этом цикле.
- **Legal retention review** — срок хранения лидов и `/privacy/` не пересматриваем без отдельной юридической задачи.
- **SmartCaptcha** — honeypot и серверного rate limit сейчас достаточно; возвращаемся только при подтверждённом спаме.

---

## Out of scope (brand stays)

| Skill/default suggestion | Keep |
|--------------------------|------|
| Orange `#F97316` | Green `#00d10e` |
| Barlow Condensed | Roadrage + Roboto |
| Gamification patterns | — |
