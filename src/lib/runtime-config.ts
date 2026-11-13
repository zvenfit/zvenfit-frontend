import { buildMode } from './site';

// Runtime API endpoints are injected at build time into /js/*-config.js.
// Development falls back to the local mock server like the legacy build did;
// staging and production refuse to build without an explicit value.

const DEV_DEFAULTS = {
  LEAD_API_URL: 'http://localhost:3000',
  SCHEDULE_API_URL: 'http://localhost:3000/schedule',
  TRAFFIC_API_URL: 'http://localhost:3000/traffic',
} as const;

export type ApiVariable = keyof typeof DEV_DEFAULTS;

function readVariable(name: ApiVariable): string {
  switch (name) {
    case 'LEAD_API_URL':
      return import.meta.env.LEAD_API_URL ?? '';
    case 'SCHEDULE_API_URL':
      return import.meta.env.SCHEDULE_API_URL ?? '';
    case 'TRAFFIC_API_URL':
      return import.meta.env.TRAFFIC_API_URL ?? '';
  }
}

export function readApiUrl(name: ApiVariable): string {
  const value = readVariable(name).trim();
  if (value) {
    return value;
  }
  const mode = buildMode();
  if (mode === 'development') {
    return DEV_DEFAULTS[name];
  }
  throw new Error(`${name} is required for a ${mode} build`);
}

export function configScript(globalName: string, value: string): Response {
  const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return new Response(`window.${globalName} = '${escaped}';\n`, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  });
}
