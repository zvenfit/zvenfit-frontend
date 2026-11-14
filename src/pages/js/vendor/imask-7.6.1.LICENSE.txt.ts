import licence from '../../../vendor/imask-7.6.1.LICENSE.txt?raw';

import type { APIRoute } from 'astro';

// MIT asks for the notice in every copy, and the minified imask in src/vendor
// carries no banner: the text keeps the address the legacy site served it
// from. scripts/check-build.cjs compares the built bytes with the source.
export const GET: APIRoute = () => new Response(licence, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
