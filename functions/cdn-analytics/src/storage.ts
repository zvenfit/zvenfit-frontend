function objectUrl(bucket: string, objectKey: string): string {
  const encodedKey = objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  return `https://storage.yandexcloud.net/${encodeURIComponent(bucket)}/${encodedKey}`;
}

async function storageRequest(
  method: 'GET' | 'PUT',
  bucket: string,
  objectKey: string,
  iamToken: string,
  body?: string,
): Promise<Response> {
  return fetch(objectUrl(bucket, objectKey), {
    method,
    headers: {
      Authorization: `Bearer ${iamToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  });
}

export async function downloadObject(
  bucket: string,
  objectKey: string,
  iamToken: string,
  maxBytes: number,
): Promise<Buffer> {
  const response = await storageRequest('GET', bucket, objectKey, iamToken);
  if (!response.ok) {
    throw new Error(`cdn_object_download_failed:${response.status}`);
  }
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error('cdn_object_too_large');
  }

  const payload = Buffer.from(await response.arrayBuffer());
  if (payload.byteLength > maxBytes) {
    throw new Error('cdn_object_too_large');
  }

  return payload;
}

export async function readJsonObject<T>(bucket: string, objectKey: string, iamToken: string): Promise<T | null> {
  const response = await storageRequest('GET', bucket, objectKey, iamToken);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`cdn_state_download_failed:${response.status}`);
  }

  return (await response.json()) as T;
}

export async function writeJsonObject(
  bucket: string,
  objectKey: string,
  iamToken: string,
  value: unknown,
): Promise<void> {
  const response = await storageRequest('PUT', bucket, objectKey, iamToken, JSON.stringify(value));
  if (!response.ok) {
    throw new Error(`cdn_state_upload_failed:${response.status}`);
  }
}
