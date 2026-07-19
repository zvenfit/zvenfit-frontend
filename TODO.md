# ZvenFit UI/UX TODO

Audit source: `ui-ux-pro-max` skill (2026-06-30).  
Stack: static Webflow HTML + `zvenfit.webflow.css` + `scripts/build-static.cjs`.

---

## Critical

- [ ] **App badges — touch targets (mobile)**  
  On `<479px`, badge height is 32px and gap is 6px (`zvenfit.webflow.css`).  
  Target: min 44×44px tap area, gap ≥8px, allow wrap on narrow screens.

- [ ] **Global focus states**  
  Add `:focus-visible` for links, buttons, dropdown, app badges (slider arrows already have focus styles).

- [ ] **Footer link contrast**  
  `.link` uses `#727272` on `#020202` (~3.4:1). Bump to ≥4.5:1 (e.g. `#9CA3AF` or lighter).

- [ ] **`prefers-reduced-motion`**  
  Disable or reduce `grain.gif` overlay and non-essential slider/transition animations.

---

## High

- [ ] **Run build-static before deploy**  
  App badge markers exist in HTML but snippets are not injected until `node scripts/build-static.cjs`.

- [ ] **Homepage social proof**  
  Add a short testimonials block on `/` (reviews exist on service pages only).  
  Pattern: Hero → proof → CTA (per landing guidelines).

- [ ] **Footer duplication**  
  `section-4` (desktop) and `section-3` (mobile) duplicate map + contacts + 2× Yandex iframe.  
  Consider single footer source or shared snippet.

- [ ] **Navigation hierarchy**  
  Service pages: clarify primary nav vs secondary (dropdown “связь с нами” only).

- [ ] **Responsive body padding**  
  `.body` uses 60px horizontal padding — verify on tablet/mobile; watch overflow with large `h1-main`.

---

## Medium

- [ ] **Auto-generate sitemap from `public/**/*.html`**  
  Script in build-static or standalone: walk indexable pages, emit `lastmod`, keep priorities configurable. Manual `sitemap.xml` drifts (e.g. `/promos/` was missing until 2026-07-06).

- [ ] **Structured data — proper Organization logo**  
  `organization.logo` uses `webclip.png` (apple-touch-icon). Replace with a dedicated brand logo ≥112×112 for knowledge panel / schema.org.

- [ ] **Base typography**  
  `body` is 14px / 1.43 line-height; prefer 16px / 1.5 on mobile. Arial still in `body` fallback.

- [ ] **Lead form (`forma-dlya-zayavki`)**  
  - Fix duplicate `id="label-select"`  
  - Improve custom select a11y (`aria-expanded`, keyboard, roles)  
  - Review `method="get"` for lead submission  
  - Clearer error copy + recovery hint

- [ ] **App badges polish**  
  - `cursor: pointer` on links  
  - `:focus-visible` styles  
  - Footer row: `flex-wrap` instead of `nowrap` on small widths

- [ ] **Map iframes**  
  Add `title` attribute for screen readers.

- [ ] **Purple accent contrast**  
  Check `#b949ff` on `#1a1a1a` for small text (WCAG AA).

---

## Low / already OK

- [x] Distinctive visual identity (not generic AI layout)
- [x] SEO basics: meta, canonical, `lang="ru"`
- [x] Open Graph + Twitter meta injected at build (`og:title`, `og:description`, `og:url`, …)
- [x] JSON-LD: `WebSite` stub on all pages; `Offer` / `ItemList` on `/promos/` and `/promos/apps/`
- [x] `/promos/` in sitemap; nav link «акции» on homepage dropdown
- [x] CDN preconnect, lazy images on badges snippet
- [x] Form visible labels, tel autocomplete, consent text
- [x] Reviews sections on service pages

---

## Pre-release checklist

- [ ] Touch targets ≥44px at 375px width
- [ ] Focus visible on all interactive elements
- [ ] Footer / muted text contrast AA
- [ ] Test with `prefers-reduced-motion: reduce`
- [ ] App badges present after build-static
- [ ] Form IDs and a11y validated
- [ ] Map iframe titles set

---

## Out of scope (brand stays)

Do **not** replace current brand tokens with skill defaults:

| Skill suggestion | Keep |
|------------------|------|
| Orange primary `#F97316` | Green `#00d10e` |
| Barlow Condensed | Roadrage + Roboto |
| Gamification patterns | — |
