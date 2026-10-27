import { defineConfig } from 'astro/config';

// Static output only. The settings below keep the generated HTML byte-compatible
// with the legacy export for the parity check (scripts/compare-dist.cjs):
// no whitespace compression, no inlined CSS or scripts, hashed assets in _astro/.
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
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
