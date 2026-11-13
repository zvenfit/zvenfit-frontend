import { configScript, readApiUrl } from '../../lib/runtime-config';

import type { APIRoute } from 'astro';

export const GET: APIRoute = () => configScript('ZVENFIT_SCHEDULE_API', readApiUrl('SCHEDULE_API_URL'));
