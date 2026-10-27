import { configScript, readApiUrl } from '../../lib/runtime-config';

import type { APIRoute } from 'astro';

export const GET: APIRoute = () => configScript('ZVENFIT_TRAFFIC_API', readApiUrl('TRAFFIC_API_URL'));
