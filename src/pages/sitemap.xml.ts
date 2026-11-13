import { SITE_URL } from '../lib/site';
import { trainerSitemapEntries } from '../lib/trainers';

import type { APIRoute } from 'astro';

// Every static page exports `sitemap = { updated, changefreq, priority }` with
// the values of the legacy hand-written sitemap. 404 is never indexable and the
// trainer pages come from the content collection (`updated` and `sitemap` of
// each entry).
export interface SitemapEntry {
  updated: string;
  changefreq: string;
  priority: string;
}

const CHANGEFREQ = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']);

const modules = import.meta.glob<{ sitemap?: SitemapEntry }>(
  ['./**/*.astro', '!./404.astro', '!./**/_*', '!./**/_*/**'],
  { eager: true },
);
// Dynamic routes ([slug].astro) are filtered here: square brackets in a glob
// are a character class, so a negative pattern with the file name matches nothing.
const pages = Object.fromEntries(Object.entries(modules).filter(([file]) => !/\[[^\]]+\]/.test(file)));

function routeFor(file: string): string {
  const stem = file.replace(/^\.\//, '').replace(/\.astro$/, '');
  if (stem === 'index') {
    return '/';
  }

  return `/${stem.replace(/\/index$/, '')}/`;
}

function validate(file: string, entry: SitemapEntry | undefined): SitemapEntry {
  if (!entry) {
    throw new Error(`sitemap: ${file} must export const sitemap = { updated, changefreq, priority }`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.updated)) {
    throw new Error(`sitemap: ${file} has an invalid updated date "${entry.updated}"`);
  }
  if (!CHANGEFREQ.has(entry.changefreq)) {
    throw new Error(`sitemap: ${file} has an invalid changefreq "${entry.changefreq}"`);
  }
  if (!/^(?:0\.\d+|1\.0)$/.test(entry.priority)) {
    throw new Error(`sitemap: ${file} has an invalid priority "${entry.priority}" (use a string such as "0.8")`);
  }

  return entry;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GET: APIRoute = async () => {
  const trainers = await trainerSitemapEntries();
  const entries = [
    ...Object.entries(pages).map(([file, module]) => ({
      loc: `${SITE_URL}${routeFor(file)}`,
      ...validate(file, module.sitemap),
    })),
    ...trainers.map(({ route, ...entry }) => ({ loc: `${SITE_URL}${route}`, ...validate(route, entry) })),
  ].sort((a, b) => a.loc.localeCompare(b.loc));
  const urls = entries
    .map(
      entry =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${entry.updated}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>\n`,
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>\n`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
