import { defineConfig } from 'astro/config';

import siteCss from './scripts/lib/site-css.cjs';

// Static output only. The settings below keep the generated HTML byte-compatible
// with the legacy export for the parity check (scripts/compare-dist.cjs):
// no whitespace compression, no inlined CSS or scripts, hashed assets in _astro/.
// Stylesheets keep their legacy bytes too: Vite does not minify them, and the
// site-css integration minifies the site stylesheet with clean-css, as the
// legacy build did (the reason is in scripts/lib/site-css.cjs).
export default defineConfig({
  site: 'https://zvenfit.ru',
  trailingSlash: 'always',
  compressHTML: false,
  // Release A1–A2a: the legacy public/ tree is frozen and must not be copied into
  // dist/. Only the two SVG logos live here until public/ is retired in A2b.
  publicDir: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  integrations: [siteCss.siteCssIntegration()],
  vite: {
    build: {
      assetsInlineLimit: 0,
      cssMinify: false,
    },
  },
});
