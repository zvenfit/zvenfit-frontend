import production from '../data/robots.production.txt?raw';
import { buildMode } from '../lib/site';

import type { APIRoute } from 'astro';

// Staging is private and must never be indexed; the byte-exact text is part
// of the deploy contract (scripts/check-staging-build.cjs).
const STAGING = 'User-agent: *\nDisallow: /\n';

export const GET: APIRoute = () =>
  new Response(buildMode() === 'staging' ? STAGING : production, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
