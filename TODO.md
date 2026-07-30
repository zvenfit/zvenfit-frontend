# ZvenFit — backlog

Приоритет: **Critical → High → Medium → Infra**. UI audit: `ui-ux-pro-max` (2026-06-30).

Agent guide: [`AGENTS.md`](AGENTS.md)

---

## Critical (a11y / mobile)

- [ ] **App badges — touch targets**  
  `<479px`: badge 32px, gap 6px. Target: ≥44×44px, gap ≥8px, wrap on narrow screens.

- [ ] **Global `:focus-visible`**  
  Links, buttons, dropdown, app badges (slider arrows already OK).

- [ ] **Footer link contrast**  
  `.link` `#727272` on `#020202` (~3.4:1) → ≥4.5:1 (e.g. `#9CA3AF`).

- [ ] **`prefers-reduced-motion`**  
  Disable/reduce `grain.gif` and non-essential slider transitions.

---

## High (UX / maintainability)

- [ ] **Run build-static before deploy**  
  Badges, OG, analytics, structured data inject only via `node scripts/build-static.cjs`.

- [ ] **Footer duplication**  
  `section-4` (desktop) + `section-3` (mobile): duplicate map + contacts + 2× Yandex iframe.  
  → single snippet/marker source.

- [ ] **Homepage social proof**  
  Testimonials block on `/` (reviews exist on service pages only).

- [ ] **Navigation hierarchy**  
  Service pages: primary nav vs secondary (dropdown «связь с нами»).

- [ ] **Responsive body padding**  
  `.body` 60px horizontal — verify tablet/mobile, watch `h1-main` overflow.

---

## Medium (polish / SEO)

- [ ] **Auto-generate sitemap** from `public/**/*.html` (manual `sitemap.xml` drifts).

- [ ] **Structured data — Organization logo**  
  Replace `webclip.png` with brand logo ≥112×112.

- [ ] **Base typography**  
  `body` 14px/1.43 → prefer 16px/1.5 on mobile. Arial in fallback stack.

- [ ] **Lead form (`forma-dlya-zayavki`)**  
  Duplicate `id="label-select"`; custom select a11y; review `method="get"`; clearer errors.

- [ ] **App badges polish**  
  `cursor: pointer`, `:focus-visible`, footer `flex-wrap` on small widths.

- [ ] **Map iframes** — add `title` for screen readers.

- [ ] **Purple accent contrast** — `#b949ff` on `#1a1a1a` for small text (WCAG AA).

---

## Infra / DX

- [x] `AGENTS.md` + `.cursor/rules/` for agent context
- [x] `.env.example` for local dev
- [x] `npm run lint:public` — lint `public/js` + `functions`
- [x] `npm run test:build` — build smoke check
- [ ] Turnstile/reCAPTCHA on lead form (spam protection)
- [ ] Lead logging (Cloud Logging or table)
- [ ] Schedule/lead smoke tests in CI (optional)
- [ ] Consolidate `README.md` / `docs/setup.md` overlap (setup stays detailed, README — index)

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

- [ ] Touch targets ≥44px @ 375px
- [ ] Focus visible on all interactives
- [ ] Footer/muted text contrast AA
- [ ] Test `prefers-reduced-motion: reduce`
- [ ] App badges present after build-static
- [ ] Form IDs and a11y validated
- [ ] Map iframe titles set

---

## Out of scope (brand stays)

| Skill/default suggestion | Keep |
|--------------------------|------|
| Orange `#F97316` | Green `#00d10e` |
| Barlow Condensed | Roadrage + Roboto |
| Gamification patterns | — |
