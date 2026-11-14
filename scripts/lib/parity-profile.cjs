'use strict';

// Parity profiles of compare-dist (plan docs/astro-migration.md, section 8).
// Both cover the whole site and differ in the base of the comparison: `a`
// compares with the pinned legacy commit, `b` with the accepted Astro main.
// The partial profile `a1` of stage A1 (three legal pages) is gone, and with
// it every partial mode of the checks: they always see the full route set.

const PROFILES = Object.freeze({
  a: Object.freeze({ base: 'legacy' }),
  b: Object.freeze({ base: 'astro' }),
});

const LEGACY_DUPLICATES = 'allowed'; // becomes 'forbidden' in A2b when public/**/*.html is removed

function getProfile(name) {
  if (!Object.hasOwn(PROFILES, name)) {
    throw new Error(`parity: unknown profile "${name}" (expected a or b)`);
  }
  return { name, ...PROFILES[name] };
}

function pageToRoute(page) {
  if (page === 'index.html') {
    return '/';
  }
  if (page.endsWith('/index.html')) {
    return `/${page.slice(0, -'index.html'.length)}`;
  }
  return `/${page}`;
}

module.exports = { LEGACY_DUPLICATES, PROFILES, getProfile, pageToRoute };
