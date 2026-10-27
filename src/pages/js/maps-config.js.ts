import { buildMapsRuntimeConfig } from '../../lib/maps';

import type { APIRoute } from 'astro';

// An empty key is allowed, as in the legacy build: the map falls back to links.
export const GET: APIRoute = () => {
  const config = buildMapsRuntimeConfig(import.meta.env.Y_MAPS_API_KEY?.trim() ?? '');

  return new Response(`window.ZVENFIT_MAPS = ${JSON.stringify(config, null, 2)};\n`, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  });
};
