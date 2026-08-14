import type { CdnLogEntry, ClassifiedEntry, TrafficClass } from './types';

const SYNTHETIC_AGENT = /zvenfit[-_ ]synthetic/i;
const KNOWN_BOT_AGENT =
  /(?:bot|crawler|spider|slurp|bingpreview|facebookexternalhit|vkshare|telegrambot|whatsapp|yandeximages|googleother)/i;
const AUTOMATION_AGENT =
  /(?:headless|playwright|puppeteer|selenium|phantom|python|curl|wget|postmanruntime|insomnia|go-http-client|java\/|libwww|node(?:\.js)?|undici)/i;
const SCANNER_PATH =
  /(?:^|\/)(?:\.env|\.git|wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|vendor\/phpunit|actuator|cgi-bin)(?:\/|$)/i;
const STATIC_PREFIX = /^\/(?:css|documents|fonts|images|js)\//i;
const STATIC_FILE = /\.(?:avif|css|gif|ico|jpe?g|js|json|map|mp4|pdf|png|svg|ttf|webp|woff2?|xml)(?:$|\?)/i;

function pathname(requestUri: string): string {
  try {
    return new URL(requestUri, 'https://zvenfit.invalid').pathname;
  } catch {
    return requestUri.split('?')[0] || '/';
  }
}

function normalizedHost(value: string): string {
  return value.toLowerCase().split(':')[0]?.trim() || '';
}

export function isPageRequest(entry: CdnLogEntry): boolean {
  const status = Number.parseInt(entry.status, 10);
  if (!Number.isFinite(status) || status < 200 || status >= 400) {
    return false;
  }

  const path = pathname(entry.request_uri);
  if (
    STATIC_PREFIX.test(path) ||
    STATIC_FILE.test(path) ||
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    path.startsWith('/api/')
  ) {
    return false;
  }

  return path === '/' || path.endsWith('/') || !/\/[^/]+\.[^/]+$/.test(path);
}

function initialTrafficClass(entry: CdnLogEntry): TrafficClass {
  if (SYNTHETIC_AGENT.test(entry.user_agent)) {
    return 'synthetic';
  }
  if (KNOWN_BOT_AGENT.test(entry.user_agent)) {
    return 'known_bot';
  }
  if (AUTOMATION_AGENT.test(entry.user_agent) || SCANNER_PATH.test(pathname(entry.request_uri))) {
    return 'suspicious';
  }

  return 'browser';
}

function volatileClientKey(entry: CdnLogEntry): string {
  return `${entry.remote_addr}\u0000${entry.user_agent}`;
}

export function classifyEntries(
  entries: CdnLogEntry[],
  suspiciousRequestsPerBatch = 100,
  siteHosts?: ReadonlySet<string>,
): ClassifiedEntry[] {
  const initial = entries.map(entry => ({
    entry,
    isPage: isPageRequest(entry) && (!siteHosts || siteHosts.has(normalizedHost(entry.http_host))),
    trafficClass: initialTrafficClass(entry),
  }));
  const browserCounts = new Map<string, number>();

  for (const classified of initial) {
    if (classified.trafficClass !== 'browser') {
      continue;
    }
    const key = volatileClientKey(classified.entry);
    browserCounts.set(key, (browserCounts.get(key) ?? 0) + 1);
  }

  return initial.map(classified => {
    if (
      classified.trafficClass === 'browser' &&
      (browserCounts.get(volatileClientKey(classified.entry)) ?? 0) > suspiciousRequestsPerBatch
    ) {
      return { ...classified, trafficClass: 'suspicious' };
    }

    return classified;
  });
}
