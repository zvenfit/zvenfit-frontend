// Content collections. `trainers` holds one JSON entry per trainer page
// (src/content/trainers/<slug>.json, the file name is the URL slug); the page
// template is src/pages/trenery/[slug].astro and the JSON-LD Person, the
// breadcrumb label and the sitemap entry come from the same data. An invalid
// entry fails the build.
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { defineCollection } from 'astro:content';

const slug = z.string().regex(/^trener-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const wNode = z.string().regex(/^w-node-[0-9a-f_-]+$/);

// Differences between the legacy trainer pages that are not content. They keep
// the output of release A identical to the legacy export and are listed with
// their reasons in scripts/migrate/manual.json; new entries do not need them.
const legacy = z
  .object({
    /** Family of the legacy markup: exported from Webflow, or written by hand later. */
    markup: z.enum(['webflow', 'handwritten']),
    /** Raw Webflow export comments that follow the doctype. */
    webflowComments: z
      .string()
      .regex(/^(?:<!--[\s\S]*?-->)+$/)
      .optional(),
    /** GTM blocks without the surrounding comments, in the head and in the body. */
    gtm: z.literal('bare').optional(),
    /** The sign-up button separates "к" and the name with a regular space. */
    ctaRegularSpace: z.literal(true).optional(),
    /** Indentation of the certificate cards in spaces when it is not the usual six. */
    certificateIndent: z.number().int().positive().optional(),
    /** Certificate links carry this `rel` instead of the usual aria-label. */
    certificateLinkRel: z.string().optional(),
    /** Path the back button falls back to when there is no history; "/" otherwise. */
    backFallbackPath: z
      .string()
      .regex(/^\/(?:[a-z0-9-]+\/)*$/)
      .optional(),
  })
  .strict();

const trainers = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/trainers' }),
  schema: z
    .object({
      /** Webflow page id; its last eight digits are the suffix of the page's w-node ids. */
      wfPage: z.string().regex(/^[0-9a-f]{24}$/),
      /** Name for JSON-LD Person and the breadcrumb. */
      name: z.string().min(1),
      /** Name in the dative case for the button «записаться к …». */
      nameDative: z.string().min(1),
      /** Job title for JSON-LD Person. */
      jobTitle: z.string().min(1),
      location: z.enum(['chekhova', 'nahabinskoe-shosse']),
      /** Name as the page heading shows it (HTML). */
      headingHtml: z.string().min(1),
      /** Role under the heading (HTML). */
      roleHtml: z.string().min(1),
      /** Modifier class of the two photo blocks; the photos live in zvenfit.webflow.css. */
      photoClass: z
        .string()
        .regex(/^[a-z0-9_-]+$/)
        .optional(),
      groups: z.array(z.object({ heading: z.string().min(1), itemsHtml: z.array(z.string().min(1)) }).strict()).min(1),
      certificates: z
        .array(
          z
            .object({
              title: z.string().min(1),
              descriptionHtml: z.string().min(1),
              href: z.string().url(),
              /** Webflow node id of the card where the legacy page had one. */
              wNode: wNode.optional(),
              /** Legacy: the description is not wrapped in the bold span. */
              plainDescription: z.literal(true).optional(),
            })
            .strict(),
        )
        .min(1)
        .optional(),
      /** Legacy: an empty certificate section stands before the divider. */
      certificatesSectionEmpty: z.literal(true).optional(),
      nextSlug: slug,
      /** Date of the last content change, the sitemap `lastmod`. */
      updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      sitemap: z
        .object({
          changefreq: z.enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']),
          priority: z.string().regex(/^(?:0\.\d+|1\.0)$/),
        })
        .strict(),
      meta: z.object({ title: z.string().min(1), description: z.string().min(1) }).strict(),
      /** Trainer id in FitBase, for the widgets planned after the migration. */
      fitbaseTrainerId: z.string().min(1).optional(),
      legacy: legacy.optional(),
    })
    .strict(),
});

export const collections = { trainers };
