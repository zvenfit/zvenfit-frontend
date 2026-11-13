// The trainer collection as the other modules need it: JSON-LD (Person and
// the breadcrumb label) and the sitemap. The page template reads the entries
// itself through getStaticPaths.
import { getCollection } from 'astro:content';

import type { TrainerConfig } from './structured-data-types';

// Webflow node ids every trainer page carries; the page's own suffix (the last
// eight hex digits of its data-wf-page) is appended. zvenfit.webflow.css lays
// the grid out by these ids.
export const TRAINER_NODES = {
  back: 'w-node-e11a7337-bde2-19aa-1b4b-c032af4154f2',
  next: 'w-node-e11a7337-bde2-19aa-1b4b-c032af4154f5',
  card: 'w-node-_3a3877c5-6cff-fbf8-e343-fd2c16920b2f',
  cta: 'w-node-_980bac73-2f9d-6ef2-62fc-7ca3af7945ed',
  photo: 'w-node-ef656b17-654a-462b-e243-174727480d7f',
  list: 'w-node-_56762e99-7fb7-f4e5-d9ce-ad52ba56dcbf',
} as const;

export async function trainerProfiles(): Promise<Record<string, TrainerConfig>> {
  const entries = await getCollection('trainers');

  return Object.fromEntries(
    entries.map(entry => [
      entry.id,
      { name: entry.data.name, jobTitle: entry.data.jobTitle, location: entry.data.location },
    ]),
  );
}

export async function trainerSitemapEntries(): Promise<
  Array<{ route: string; updated: string; changefreq: string; priority: string }>
> {
  const entries = await getCollection('trainers');

  return entries.map(entry => ({
    route: `/trenery/${entry.id}/`,
    updated: entry.data.updated,
    changefreq: entry.data.sitemap.changefreq,
    priority: entry.data.sitemap.priority,
  }));
}
