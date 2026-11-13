import { configScript, readApiUrl } from '../../lib/runtime-config';

import type { APIRoute } from 'astro';

export const GET: APIRoute = () => configScript('ZVENFIT_LEAD_API', readApiUrl('LEAD_API_URL'));
