// Data and helpers of the site footer (src/components/Footer*.astro).

export type FooterLocation = 'chekhova' | 'nahabinskoe-shosse';

interface FooterPlace {
  /** Address heading; the non-breaking spaces are part of the legacy markup. */
  address: string;
  phone: string;
  phoneHref: string;
  /** Indentation of the app-badge block in the legacy markup of this footer. */
  badgeIndent: number;
}

export const FOOTER_PLACES: Record<FooterLocation, FooterPlace> = {
  chekhova: {
    address: 'Звенигород, Чехова 13А',
    phone: '+7 (925) 308-23-23',
    phoneHref: 'tel:+79253082323',
    badgeIndent: 12,
  },
  'nahabinskoe-shosse': {
    address: 'Звенигород, Нахабинское\u00a0шоссе,\u00a07А',
    phone: '+7 (968) 844-00-88',
    phoneHref: 'tel:+79688440088',
    badgeIndent: 16,
  },
};

// The grid footer of the home page, 404, platforms and schedule pages names
// both clubs, so its badge block is indented like the Chekhova footer.
export const GRID_BADGE_INDENT = 12;

// The legal link that points at the current page keeps the Webflow current
// state: aria-current="page" and the w--current class appended to its classes.
export function legalCurrent(path: string, href: string): 'page' | undefined {
  return path === href ? 'page' : undefined;
}

export function legalClass(path: string, href: string, base: string): string {
  return path === href ? `${base} w--current` : base;
}
