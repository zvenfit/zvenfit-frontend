import { createHash, timingSafeEqual } from 'node:crypto';

type AuthorizerEvent = {
  headers?: Record<string, string | string[] | undefined>;
};

type AuthorizerResponse = {
  isAuthorized: boolean;
  context?: Record<string, string>;
};

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

function headerValue(headers: AuthorizerEvent['headers'], name: string): string {
  if (!headers) {
    return '';
  }

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];

  return Array.isArray(value) ? value[0] || '' : value || '';
}

function decodeBasicCredentials(authorization: string): string | null {
  const match = authorization.match(/^Basic\s+([A-Za-z0-9+/]+={0,2})$/i);
  if (!match?.[1]) {
    return null;
  }

  try {
    const credentials = Buffer.from(match[1], 'base64').toString('utf8');

    return credentials.includes(':') ? credentials : null;
  } catch {
    return null;
  }
}

function isAuthorized(event: AuthorizerEvent, expectedHash: string | undefined): boolean {
  if (!expectedHash || !SHA256_HEX_PATTERN.test(expectedHash)) {
    return false;
  }

  const credentials = decodeBasicCredentials(headerValue(event.headers, 'authorization'));
  if (!credentials) {
    return false;
  }

  const actual = createHash('sha256').update(credentials, 'utf8').digest();
  const expected = Buffer.from(expectedHash, 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function handler(event: AuthorizerEvent): Promise<AuthorizerResponse> {
  if (!isAuthorized(event, process.env.BASIC_AUTH_CREDENTIAL_SHA256)) {
    return { isAuthorized: false };
  }

  return {
    isAuthorized: true,
    context: { environment: 'staging' },
  };
}

export { decodeBasicCredentials, isAuthorized };
