---
type: reference
title: ZvenFit site information architecture and pricing ownership
updated: 2026-08-28
---

# Site information architecture and pricing ownership

This note records the responsibility of the main service pages and the agreed
rules for placing tariff content. The editable site source remains `public/`;
generated files in `dist/` are not a source of truth.

## Page responsibilities

- `/trenazhernyj-zal/` is an overview and navigation hub for the gym. It
  describes the space and available formats: independent training, personal
  training, mini-groups, pair training, and personal training for teenagers.
  Its format cards should lead to the corresponding product pages rather than
  duplicate complete price matrices.
- `/klubnaya-karta/` owns gym-access membership prices for independent
  training.
- `/personalnye-trenirovki/` owns personal-training content and complete
  personal-training price matrices. Personal training for teenagers aged
  13–17 belongs here as a distinct tariff section.
- `/parnye-trenirovki/` owns pair and family-split training prices.
- `/trenazhernyj-zal/mini-gruppy/` owns gym mini-group content and prices.
- `/gruppovye-trenirovki/` owns group-program content and prices.
- `/pilates-na-reformere/` and its child pages own reformer formats and prices.

## Pricing placement rules

1. A complete tariff matrix lives on the page that owns the product.
2. Overview pages may contain a short offer and a CTA, but should not be the
   only location of a related product's full price matrix.
3. Do not duplicate the same complete price matrix on multiple pages. Use a
   link to the owning page and a stable section anchor instead, so future price
   updates have one source of truth.
4. Keep `Standard` and `With a club card` variants visibly separate when both
   variants exist; club-card pricing must not replace or obscure standard
   pricing.
5. When a pricing section moves, update inbound links, anchor contracts, and
   the owning Playwright checks in `zvenfit-autotests` together.

## Teenager tariff structure

The teenager tariffs describe hour-long personal sessions with a professional
trainer, not a gym-access membership. Their former placement as the only full
price matrix on `/trenazhernyj-zal/` conflicted with the hub role of that page.

Implemented structure:

- the complete teenager tariff section lives at
  `/personalnye-trenirovki/#teen-prices`, after the main personal-training
  prices and before reviews;
- the teenager format card remains on `/trenazhernyj-zal/` for discovery;
- that card's `Подробнее` CTA points to
  `/personalnye-trenirovki/#teen-prices`;
- the personal-training page is the only complete copy of the teenager price
  matrix;
- browser contracts cover the placement, deep link, prices, and desktop/mobile
  tab interaction.
