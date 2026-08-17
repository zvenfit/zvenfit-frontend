import { setDefaultResultOrder } from 'node:dns';
import { isIPv4, type LookupFunction } from 'node:net';

import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';

const TELEGRAM_API_HOST = 'api.telegram.org';
const TELEGRAM_ROUTE_PROBE_TIMEOUT_MS = 2_000;
const TELEGRAM_ROUTE_CACHE_TTL_MS = 5 * 60_000;
const MAX_TELEGRAM_FALLBACK_IPV4S = 5;

export type RequestFactory = (
  url: URL,
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;

export type TelegramRoute = {
  key: string;
  lookup?: LookupFunction;
};

type CachedTelegramRoute = {
  expiresAt: number;
  fallbackFingerprint: string;
  requestFactory: RequestFactory;
  route: TelegramRoute;
};

let cachedTelegramRoute: CachedTelegramRoute | undefined;
let pendingTelegramRoute:
  | {
      fallbackFingerprint: string;
      requestFactory: RequestFactory;
      selection: Promise<TelegramRoute>;
    }
  | undefined;

// Yandex Cloud Functions has public IPv4 egress only, while Telegram DNS returns IPv6 first.
setDefaultResultOrder('ipv4first');

export function telegramError(
  message: string,
  code: string,
  status?: number,
): Error & { code: string; status?: number } {
  return Object.assign(new Error(message), { code, name: 'TelegramError', status });
}

function telegramFallbackIpv4s(): string[] {
  const values = [process.env.TELEGRAM_API_FALLBACK_IPV4S || '', process.env.TELEGRAM_API_IPV4 || '']
    .flatMap(value => value.split(/[\s,]+/))
    .map(value => value.trim())
    .filter(Boolean);
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length > MAX_TELEGRAM_FALLBACK_IPV4S) {
    throw telegramError('Too many Telegram fallback IPv4 routes', 'telegram_misconfigured');
  }
  if (uniqueValues.some(value => !isIPv4(value))) {
    throw telegramError('Telegram fallback IPv4 list is invalid', 'telegram_misconfigured');
  }

  return uniqueValues;
}

function telegramLookup(address: string): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address, family: 4 }]);

      return;
    }

    callback(null, address, 4);
  };
}

export function telegramNetworkErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) {
    return 'telegram_timeout';
  }

  const directCode = error && typeof error === 'object' && 'code' in error ? error.code : null;
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
  const causeCode = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  const code = typeof directCode === 'string' ? directCode : causeCode;
  if (typeof code !== 'string') {
    return 'telegram_unreachable';
  }

  const normalizedCode = code
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 40);

  return normalizedCode ? `telegram_${normalizedCode}` : 'telegram_unreachable';
}

function telegramRoutes(fallbackIpv4s: string[]): TelegramRoute[] {
  return [
    { key: 'dns' },
    ...fallbackIpv4s.map(address => ({
      key: `ipv4:${address}`,
      lookup: telegramLookup(address),
    })),
  ];
}

async function probeTelegramRoute(route: TelegramRoute, requestFactory: RequestFactory): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = requestFactory(
      new URL(`https://${TELEGRAM_API_HOST}/`),
      {
        method: 'HEAD',
        family: 4,
        ...(route.lookup ? { lookup: route.lookup } : {}),
        signal: AbortSignal.timeout(TELEGRAM_ROUTE_PROBE_TIMEOUT_MS),
      },
      incoming => {
        incoming.resume();
        resolve();
      },
    );
    request.on('error', reject);
    request.end();
  });
}

async function chooseTelegramRoute(fallbackIpv4s: string[], requestFactory: RequestFactory): Promise<TelegramRoute> {
  const routes = telegramRoutes(fallbackIpv4s);
  const results = await Promise.all(
    routes.map(async route => {
      try {
        await probeTelegramRoute(route, requestFactory);

        return { error: undefined, route };
      } catch (error) {
        return { error, route };
      }
    }),
  );
  const healthy = results.find(result => result.error === undefined);
  if (healthy) {
    return healthy.route;
  }

  throw telegramError('Telegram is unreachable', telegramNetworkErrorCode(results[0]?.error));
}

export async function selectTelegramRoute(requestFactory: RequestFactory): Promise<TelegramRoute> {
  const fallbackIpv4s = telegramFallbackIpv4s();
  const fallbackFingerprint = fallbackIpv4s.join(',');
  const now = Date.now();
  if (
    cachedTelegramRoute &&
    cachedTelegramRoute.expiresAt > now &&
    cachedTelegramRoute.fallbackFingerprint === fallbackFingerprint &&
    cachedTelegramRoute.requestFactory === requestFactory
  ) {
    return cachedTelegramRoute.route;
  }
  if (
    pendingTelegramRoute &&
    pendingTelegramRoute.fallbackFingerprint === fallbackFingerprint &&
    pendingTelegramRoute.requestFactory === requestFactory
  ) {
    return pendingTelegramRoute.selection;
  }

  const selection = chooseTelegramRoute(fallbackIpv4s, requestFactory);
  pendingTelegramRoute = { fallbackFingerprint, requestFactory, selection };
  try {
    const route = await selection;
    cachedTelegramRoute = {
      expiresAt: Date.now() + TELEGRAM_ROUTE_CACHE_TTL_MS,
      fallbackFingerprint,
      requestFactory,
      route,
    };

    return route;
  } finally {
    if (pendingTelegramRoute?.selection === selection) {
      pendingTelegramRoute = undefined;
    }
  }
}

export function invalidateTelegramRoute(route: TelegramRoute): void {
  if (cachedTelegramRoute?.route.key === route.key) {
    cachedTelegramRoute = undefined;
  }
}

function resetTelegramRouteCache(): void {
  cachedTelegramRoute = undefined;
  pendingTelegramRoute = undefined;
}

export const _private = {
  resetTelegramRouteCache,
  selectTelegramRoute,
  telegramFallbackIpv4s,
  telegramLookup,
  telegramNetworkErrorCode,
};
