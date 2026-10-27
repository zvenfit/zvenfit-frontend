'use strict';

// Parity profiles shared by compare-dist, check-routes, check-build and the
// staging build test (plan docs/astro-migration.md, sections 7 and 8).
//
// `a1` is the only partial profile: it covers the three legal pages converted
// in PR A1 and is allowed only inside branch A1. Deploy guards and the final
// pull requests into main use the full profiles `a` (legacy base) and `b`
// (accepted Astro main as base).

const PROFILES = Object.freeze({
  a1: Object.freeze({
    partial: true,
    base: 'legacy',
    pages: Object.freeze(['offer/index.html', 'privacy/index.html', 'payment-policy/index.html']),
    requires404: false,
  }),
  a: Object.freeze({ partial: false, base: 'legacy', pages: null, requires404: true }),
  b: Object.freeze({ partial: false, base: 'astro', pages: null, requires404: true }),
});

const LEGACY_DUPLICATES = 'allowed'; // becomes 'forbidden' in A2b when public/**/*.html is removed

function getProfile(name) {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(`parity: unknown profile "${name}" (expected a1, a or b)`);
  }
  return { name, ...profile };
}

function readProfileArgument(argv, fallback) {
  const index = argv.indexOf('--profile');
  if (index === -1) {
    return getProfile(fallback);
  }
  const value = argv[index + 1];
  if (!value) {
    throw new Error('parity: --profile requires a value (a1, a or b)');
  }
  return getProfile(value);
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

module.exports = { LEGACY_DUPLICATES, PROFILES, getProfile, pageToRoute, readProfileArgument };
