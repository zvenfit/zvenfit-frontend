'use strict';

// The schema of the `trainers` collection and the sitemap validation are
// TypeScript modules without Astro imports: Node strips the types itself
// (22.18 and later), so the tests run the same code as the build.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const ENTRIES_DIR = path.join(ROOT, 'src', 'content', 'trainers');

const load = file => import(pathToFileURL(path.join(ROOT, 'src', 'lib', file)).href);
const readEntry = slug => JSON.parse(fs.readFileSync(path.join(ENTRIES_DIR, `${slug}.json`), 'utf8'));
const slugs = fs
  .readdirSync(ENTRIES_DIR)
  .filter(name => name.endsWith('.json'))
  .map(name => name.replace(/\.json$/, ''))
  .sort();

// Fields zod refused, for example `certificates.0.href`; a field with two issues is listed once.
function refusedPaths(schema, entry) {
  const result = schema.safeParse(entry);
  return result.success ? [] : [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
}

test('every committed trainer entry passes the schema and comes out unchanged', async () => {
  const { TRAINER_SLUG, collectionProblems, trainerSchema } = await load('trainer-schema.ts');
  assert.equal(slugs.length, 21);
  const entries = slugs.map(slug => ({ id: slug, data: readEntry(slug) }));
  for (const { id, data } of entries) {
    assert.match(id, TRAINER_SLUG);
    const result = trainerSchema.safeParse(data);
    assert.ok(result.success, `${id}: ${result.success ? '' : JSON.stringify(result.error.issues)}`);
    assert.deepEqual(result.data, data, `${id} must not be rewritten by the schema`);
  }
  assert.deepEqual(collectionProblems(entries), []);
});

test('the schema refuses a date that is not a calendar date', async () => {
  const { trainerSchema } = await load('trainer-schema.ts');
  const entry = readEntry('trener-efim');
  for (const updated of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-1-05', '2026-05-13T00:00:00Z', '13.05.2026', '']) {
    assert.deepEqual(refusedPaths(trainerSchema, { ...entry, updated }), ['updated'], updated);
  }
  for (const updated of ['2026-05-13', '2028-02-29', '2026-12-31']) {
    assert.deepEqual(refusedPaths(trainerSchema, { ...entry, updated }), [], updated);
  }
});

test('the schema refuses a certificate link that is not https', async () => {
  const { trainerSchema } = await load('trainer-schema.ts');
  const entry = readEntry('trener-natalya-shulepova');
  assert.ok(entry.certificates.length > 0);
  const withHref = href => ({ ...entry, certificates: [{ ...entry.certificates[0], href }, ...entry.certificates.slice(1)] });
  for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://example.com/a.pdf', '//example.com/a.pdf', '/documents/a.pdf', 'a.pdf']) {
    assert.deepEqual(refusedPaths(trainerSchema, withHref(href)), ['certificates.0.href'], href);
  }
  assert.match(entry.certificates[0].href, /^https:\/\//);
  assert.deepEqual(refusedPaths(trainerSchema, withHref('https://example.com/a.pdf')), []);
});

test('the schema refuses markup between or around the Webflow comments', async () => {
  const { trainerSchema } = await load('trainer-schema.ts');
  const entry = readEntry('trener-anna');
  const committed = entry.legacy.webflowComments;
  assert.match(committed, /^<!--[^>]*--><!--[^>]*-->$/);
  const withComments = webflowComments => ({ ...entry, legacy: { ...entry.legacy, webflowComments } });
  for (const webflowComments of [
    '<!-- a --><script>alert(1)</script><!-- b -->',
    '<!-- a -->text<!-- b -->',
    '<!-- a --> <!-- b -->',
    '<script>alert(1)</script>',
    '<!-- a -->x',
    'x<!-- a -->',
    '<!-- a',
    '',
  ]) {
    assert.deepEqual(refusedPaths(trainerSchema, withComments(webflowComments)), ['legacy.webflowComments'], webflowComments);
  }
  for (const webflowComments of [committed, '<!-- a -->', '<!-- a -- b --><!---->']) {
    assert.deepEqual(refusedPaths(trainerSchema, withComments(webflowComments)), [], webflowComments);
  }
});

test('the schema still refuses unknown fields and a next trainer that is not a slug', async () => {
  const { trainerSchema } = await load('trainer-schema.ts');
  const entry = readEntry('trener-efim');
  assert.equal(trainerSchema.safeParse({ ...entry, photo: 'efim' }).success, false);
  assert.deepEqual(refusedPaths(trainerSchema, { ...entry, nextSlug: 'ivan-petrov' }), ['nextSlug']);
  assert.deepEqual(refusedPaths(trainerSchema, { ...entry, wfPage: '2008aa7b' }), ['wfPage']);
});

test('an entry whose file name is not trener-<name>.json fails the collection check', async () => {
  const { collectionProblems } = await load('trainer-schema.ts');
  const next = { nextSlug: 'trener-efim' };
  const efim = { id: 'trener-efim', data: next };
  for (const id of ['ivan-petrov', 'trener', 'trener-', 'trener--ivan', 'trener_ivan', 'Trener-Ivan', 'trener-иван', 'coach-ivan']) {
    const problems = collectionProblems([efim, { id, data: next }]);
    assert.deepEqual(problems, [`src/content/trainers/${id}.json must be named trener-<name>.json (lowercase Latin letters, digits and hyphens)`], id);
  }
  assert.deepEqual(collectionProblems([efim, { id: 'trener-ivan-petrov-2', data: next }]), []);
  assert.deepEqual(collectionProblems([{ id: 'trener-ivan', data: { nextSlug: 'trener-missing' } }]), ['trener-ivan points at the missing next trainer "trener-missing"']);
});

test('the sitemap refuses the same impossible dates for pages and trainers', async () => {
  const { validateSitemapEntry } = await load('sitemap.ts');
  const entry = { updated: '2026-05-13', changefreq: 'yearly', priority: '0.3' };
  assert.deepEqual(validateSitemapEntry('./offer/index.astro', entry), entry);
  for (const updated of ['2026-13-45', '2026-02-30', '2026-5-13', '']) {
    assert.throws(() => validateSitemapEntry('./offer/index.astro', { ...entry, updated }), new RegExp(`sitemap: \\./offer/index\\.astro has an invalid updated date "${updated}"`));
  }
  assert.throws(() => validateSitemapEntry('./offer/index.astro', undefined), /must export const sitemap/);
  assert.throws(() => validateSitemapEntry('/trenery/trener-efim/', { ...entry, changefreq: 'often' }), /invalid changefreq "often"/);
  assert.throws(() => validateSitemapEntry('/trenery/trener-efim/', { ...entry, priority: '0,6' }), /invalid priority "0,6"/);
});
