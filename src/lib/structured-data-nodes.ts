// JSON-LD node builders ported one to one from the legacy build-static.cjs.
import type { JsonLd, LocationConfig, PageMeta, PromoOffer, StructuredDataConfig } from './structured-data-types';

export function resolveStructuredDataUrl(siteUrl: string, pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) {
    return undefined;
  }
  if (pathOrUrl.startsWith('http')) {
    return pathOrUrl;
  }

  return `${siteUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function buildOpeningHours(location: LocationConfig): JsonLd {
  if (!location.openingHours?.length) {
    return {};
  }

  return {
    openingHoursSpecification: location.openingHours.map(spec => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: spec.dayOfWeek,
      opens: spec.opens,
      closes: spec.closes,
    })),
  };
}

export function buildOrganizationNode(cfg: StructuredDataConfig, siteUrl: string, full: boolean): JsonLd {
  const node: JsonLd = {
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: cfg.organization.name,
    url: `${siteUrl}/`,
  };
  const logoUrl = resolveStructuredDataUrl(siteUrl, cfg.organization.logo);
  if (logoUrl) {
    node.logo = logoUrl;
  }
  if (full) {
    node.subOrganization = Object.values(cfg.locations).map(location => ({ '@id': `${siteUrl}/#${location.id}` }));
    if (cfg.organization.sameAs?.length) {
      node.sameAs = cfg.organization.sameAs;
    }
  }

  return node;
}

export function buildLocationNode(location: LocationConfig, siteUrl: string): JsonLd {
  return {
    '@type': 'HealthClub',
    '@id': `${siteUrl}/#${location.id}`,
    name: location.name,
    ...(location.alternateName ? { alternateName: location.alternateName } : {}),
    description: location.description,
    ...(location.url ? { url: resolveStructuredDataUrl(siteUrl, location.url) } : {}),
    telephone: location.telephone,
    email: location.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: location.streetAddress,
      addressLocality: location.addressLocality,
      addressRegion: location.addressRegion,
      addressCountry: location.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: location.latitude,
      longitude: location.longitude,
    },
    ...buildOpeningHours(location),
    ...(location.sameAs?.length ? { sameAs: location.sameAs } : {}),
    parentOrganization: { '@id': `${siteUrl}/#organization` },
  };
}

export function getBreadcrumbLabel(segment: string, cfg: StructuredDataConfig): string {
  const trainer = cfg.trainers?.[segment];
  if (trainer) {
    return trainer.name;
  }

  return cfg.breadcrumbLabels?.[segment] || segment.replace(/-/g, ' ');
}

export function buildBreadcrumbList(pagePath: string, siteUrl: string, cfg: StructuredDataConfig): JsonLd | null {
  if (pagePath === '/') {
    return null;
  }
  const skipSegments = new Set(cfg.breadcrumbSkipSegments || []);
  const segments = pagePath
    .replace(/^\/|\/$/g, '')
    .split('/')
    .filter(Boolean)
    .filter(segment => !skipSegments.has(segment));
  const items: JsonLd[] = [
    {
      '@type': 'ListItem',
      position: 1,
      name: cfg.breadcrumbLabels?.home || 'Главная',
      item: `${siteUrl}/`,
    },
  ];
  let currentPath = '';
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === segments.length - 1;
    items.push({
      '@type': 'ListItem',
      position: index + 2,
      name: getBreadcrumbLabel(segment, cfg),
      ...(isLast ? {} : { item: `${siteUrl}${currentPath}/` }),
    });
  });

  return {
    '@type': 'BreadcrumbList',
    '@id': `${siteUrl}${pagePath}#breadcrumb`,
    itemListElement: items,
  };
}

export function buildWebSiteNode(cfg: StructuredDataConfig, siteUrl: string): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: cfg.organization.name,
    publisher: { '@id': `${siteUrl}/#organization` },
  };
}

export function buildPromoOfferNode(offer: PromoOffer, siteUrl: string, pagePath: string, index: number): JsonLd {
  const node: JsonLd = {
    '@type': 'Offer',
    '@id': `${siteUrl}${pagePath}#offer-${offer.id || index}`,
    name: offer.name,
    ...(offer.description ? { description: offer.description } : {}),
    url: resolveStructuredDataUrl(siteUrl, offer.url || pagePath),
    availability: 'https://schema.org/InStock',
    seller: { '@id': `${siteUrl}/#organization` },
  };
  if (offer.price != null) {
    node.price = String(offer.price);
    node.priceCurrency = offer.priceCurrency || 'RUB';
  }

  return node;
}

export function appendPromosStructuredData(
  pagePath: string,
  siteUrl: string,
  cfg: StructuredDataConfig,
  graph: JsonLd[],
): JsonLd | null {
  const promosPage = cfg.promosPages?.[pagePath];
  if (!promosPage?.offers?.length) {
    return null;
  }
  const offerNodes = promosPage.offers.map((offer, index) => buildPromoOfferNode(offer, siteUrl, pagePath, index));
  if (pagePath === '/promos/') {
    graph.push(...offerNodes);
    const itemList: JsonLd = {
      '@type': 'ItemList',
      '@id': `${siteUrl}${pagePath}#offers`,
      name: promosPage.itemListName || 'Акции ZvenFit',
      itemListElement: offerNodes.map((offerNode, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: { '@id': offerNode['@id'] },
      })),
    };
    graph.push(itemList);

    return { '@id': itemList['@id'] };
  }
  if (pagePath === '/promos/apps/') {
    const first = offerNodes[0] as JsonLd;
    graph.push(first);

    return { '@id': first['@id'] };
  }

  return null;
}

export function buildTrialOffer(
  siteUrl: string,
  pagePath: string,
  cfg: StructuredDataConfig,
  locationKey: string,
): JsonLd {
  const offer = cfg.trialOffer;
  if (!offer || locationKey !== 'chekhova') {
    return {};
  }

  return {
    offers: {
      '@type': 'Offer',
      name: offer.name,
      price: String(offer.price),
      priceCurrency: offer.priceCurrency || 'RUB',
      url: `${siteUrl}${pagePath}`,
      availability: 'https://schema.org/InStock',
    },
  };
}

export function buildWebPageNode(
  pagePath: string,
  siteUrl: string,
  meta: PageMeta,
  options: { mainEntity?: unknown; includeAbout?: boolean },
): JsonLd {
  return {
    '@type': 'WebPage',
    '@id': `${siteUrl}${pagePath}#webpage`,
    url: `${siteUrl}${pagePath}`,
    ...(meta.title ? { name: meta.title } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    isPartOf: { '@id': `${siteUrl}/#website` },
    ...(options.includeAbout ? { about: { '@id': `${siteUrl}/#organization` } } : {}),
    ...(options.mainEntity ? { mainEntity: options.mainEntity } : {}),
  };
}
