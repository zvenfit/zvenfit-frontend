// Validation of a sitemap entry: the `sitemap` export of a page or the
// `updated` and `sitemap` fields of a trainer entry. The module imports nothing
// but zod, so the script tests load it without the Astro runtime
// (scripts/__tests__/trainer-schema.test.cjs).
import { z } from 'astro/zod';

export interface SitemapEntry {
  updated: string;
  changefreq: string;
  priority: string;
}

const CHANGEFREQ = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']);
// The same check as `updated` of the trainer schema: a calendar date, not just three groups of digits.
const calendarDate = z.iso.date();

export function validateSitemapEntry(file: string, entry: SitemapEntry | undefined): SitemapEntry {
  if (!entry) {
    throw new Error(`sitemap: ${file} must export const sitemap = { updated, changefreq, priority }`);
  }
  if (!calendarDate.safeParse(entry.updated).success) {
    throw new Error(
      `sitemap: ${file} has an invalid updated date "${entry.updated}" (use a calendar date, YYYY-MM-DD)`,
    );
  }
  if (!CHANGEFREQ.has(entry.changefreq)) {
    throw new Error(`sitemap: ${file} has an invalid changefreq "${entry.changefreq}"`);
  }
  if (!/^(?:0\.\d+|1\.0)$/.test(entry.priority)) {
    throw new Error(`sitemap: ${file} has an invalid priority "${entry.priority}" (use a string such as "0.8")`);
  }

  return entry;
}
