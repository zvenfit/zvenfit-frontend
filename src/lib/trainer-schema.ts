// Schema of an entry of the `trainers` collection
// (src/content/trainers/<slug>.json) and the checks of the collection as a
// whole. The module imports nothing but zod, so the script tests load it
// without the Astro runtime (scripts/__tests__/trainer-schema.test.cjs).
import { z } from 'astro/zod';

/** Entry id (the file name) and the URL segment of the page: /trenery/<slug>/. */
export const TRAINER_SLUG = /^trener-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const wNode = z.string().regex(/^w-node-[0-9a-f_-]+$/);

// Differences between the legacy trainer pages that are not content. They keep
// the output of release A identical to the legacy export and are listed with
// their reasons in scripts/migrate/manual.json; new entries do not need them.
const legacy = z
  .object({
    /** Family of the legacy markup: exported from Webflow, or written by hand later. */
    markup: z.enum(['webflow', 'handwritten']),
    /** Raw Webflow export comments that follow the doctype: comments only, nothing between them. */
    webflowComments: z
      .string()
      .regex(/^(?:<!--(?:(?!-->)[\s\S])*-->)+$/)
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

export const trainerSchema = z
  .object({
    /**
     * Webflow page id; its last eight digits are the suffix of the page's w-node
     * ids. zvenfit.webflow.css lays the page out by these ids only, so a new
     * entry takes the wfPage of an existing page with the same layout or brings
     * its own rules (scripts/check-build.cjs checks the built page).
     */
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
    /**
     * Modifier class of the two photo blocks; the photos live in
     * zvenfit.webflow.css as .photo_coach.<class> and .photo_coach_mini.<class>.
     * Without it the page shows the base photos, which are those of trener-efim.
     */
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
            /** The document opens in a new tab; only https links are accepted. */
            href: z.url({ protocol: /^https$/ }),
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
    nextSlug: z.string().regex(TRAINER_SLUG),
    /** Date of the last content change, the sitemap `lastmod`: a calendar date, YYYY-MM-DD. */
    updated: z.iso.date(),
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
  .strict();

/**
 * Problems the entry schema cannot see: the entry id is not part of the data,
 * and `nextSlug` points at another entry. The page URL, the JSON-LD Person and
 * the breadcrumb label are all found by the `trener-…` id.
 */
export function collectionProblems(entries: ReadonlyArray<{ id: string; data: { nextSlug: string } }>): string[] {
  const ids = new Set(entries.map(entry => entry.id));
  const problems: string[] = [];
  for (const entry of entries) {
    if (!TRAINER_SLUG.test(entry.id)) {
      problems.push(
        `src/content/trainers/${entry.id}.json must be named trener-<name>.json (lowercase Latin letters, digits and hyphens)`,
      );
    }
    if (!ids.has(entry.data.nextSlug)) {
      problems.push(`${entry.id} points at the missing next trainer "${entry.data.nextSlug}"`);
    }
  }

  return problems;
}
