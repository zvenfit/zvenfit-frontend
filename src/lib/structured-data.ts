// JSON-LD graph per page. A faithful port of the legacy build-static.cjs
// generator: same node order, same identifiers, same conditions. Release A
// keeps the data in scripts/structured-data.config.json (frozen with the
// legacy build); the trainers block moves to the content collection in A2a.
import {
  appendPromosStructuredData,
  buildBreadcrumbList,
  buildLocationNode,
  buildOrganizationNode,
  buildTrialOffer,
  buildWebPageNode,
  buildWebSiteNode,
} from './structured-data-nodes';
import config from '../../scripts/structured-data.config.json';

import type { JsonLd, PageMeta, StructuredDataConfig } from './structured-data-types';

export { resolveStructuredDataUrl } from './structured-data-nodes';
export type { LocationConfig, PageMeta, StructuredDataConfig } from './structured-data-types';

export const structuredDataConfig = config as unknown as StructuredDataConfig;

const FULL_GRAPH_PAGES = new Set(['/', '/contacts/platforms/']);

export function buildStructuredData(
  pagePath: string,
  meta: PageMeta,
  cfg: StructuredDataConfig = structuredDataConfig,
): JsonLd | null {
  if (pagePath === '/404.html') {
    return null;
  }
  const siteUrl = cfg.siteUrl.replace(/\/$/, '');
  const graph: JsonLd[] = [];
  const useFullGraph = FULL_GRAPH_PAGES.has(pagePath);
  let mainEntity: unknown;

  graph.push(buildOrganizationNode(cfg, siteUrl, useFullGraph));
  graph.push(buildWebSiteNode(cfg, siteUrl));
  if (useFullGraph) {
    for (const location of Object.values(cfg.locations)) {
      graph.push(buildLocationNode(location, siteUrl));
    }
  }
  if (pagePath === '/') {
    mainEntity = { '@id': `${siteUrl}/#organization` };
  }
  if (pagePath === '/contacts/platforms/') {
    mainEntity = Object.values(cfg.locations).map(location => ({ '@id': `${siteUrl}/#${location.id}` }));
  }

  const pageConfig = cfg.pages?.[pagePath];
  if (pageConfig?.services?.length) {
    const locationKey = pageConfig.primaryLocation || 'chekhova';
    const location = cfg.locations[locationKey];
    if (!location) {
      throw new Error(`structured-data: unknown location "${locationKey}" for ${pagePath}`);
    }
    for (const service of pageConfig.services) {
      const serviceId = `${siteUrl}${pagePath}#service`;
      graph.push({
        '@type': 'Service',
        '@id': serviceId,
        name: service.name,
        ...(service.description ? { description: service.description } : {}),
        url: `${siteUrl}${pagePath}`,
        provider: { '@id': `${siteUrl}/#${location.id}` },
        areaServed: { '@type': 'City', name: 'Звенигород' },
        ...buildTrialOffer(siteUrl, pagePath, cfg, locationKey),
      });
      mainEntity = { '@id': serviceId };
    }
  }

  const trainerMatch = pagePath.match(/^\/trenery\/(trener-[^/]+)\/$/);
  const trainer = trainerMatch ? cfg.trainers?.[trainerMatch[1] as string] : undefined;
  if (trainer) {
    const locationKey = trainer.location || 'chekhova';
    const location = cfg.locations[locationKey];
    if (!location) {
      throw new Error(`structured-data: unknown location "${locationKey}" for ${pagePath}`);
    }
    const personId = `${siteUrl}${pagePath}#person`;
    graph.push({
      '@type': 'Person',
      '@id': personId,
      name: trainer.name,
      jobTitle: trainer.jobTitle,
      url: `${siteUrl}${pagePath}`,
      worksFor: { '@id': `${siteUrl}/#${location.id}` },
    });
    mainEntity = { '@id': personId };
  }

  const promosMainEntity = appendPromosStructuredData(pagePath, siteUrl, cfg, graph);
  if (promosMainEntity) {
    mainEntity = promosMainEntity;
  }

  graph.push(
    buildWebPageNode(pagePath, siteUrl, meta, { mainEntity, includeAbout: pagePath === '/contacts/platforms/' }),
  );
  const breadcrumb = buildBreadcrumbList(pagePath, siteUrl, cfg);
  if (breadcrumb) {
    graph.push(breadcrumb);
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}
