// Content collections. `trainers` holds one JSON entry per trainer page
// (src/content/trainers/<slug>.json, the file name is the URL slug); the page
// template is src/pages/trenery/[slug].astro and the JSON-LD Person, the
// breadcrumb label and the sitemap entry come from the same data. An invalid
// entry fails the build; the schema lives in src/lib/trainer-schema.ts.
import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';

import { trainerSchema } from './lib/trainer-schema';

const trainers = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/trainers' }),
  schema: trainerSchema,
});

export const collections = { trainers };
