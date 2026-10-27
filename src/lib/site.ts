// Site-wide constants shared by the layout, components and endpoints.
// The bucket addresses stay exactly as the legacy pages reference them until
// release B moves the vendor files into the repository.

export const SITE_URL = 'https://zvenfit.ru';
export const ASSETS_CDN_BASE = 'https://storage.yandexcloud.net/zvenfit/v2';

export type BuildMode = 'production' | 'staging' | 'development';

export function buildMode(): BuildMode {
  const mode = import.meta.env.MODE;
  if (mode === 'production' || mode === 'staging' || mode === 'development') {
    return mode;
  }
  throw new Error(`Unknown build mode "${mode}": use --mode production|staging|development`);
}

// Legacy build-static.cjs used ASSET_VERSION "2" when the variable was unset.
export function assetVersion(): string {
  return import.meta.env.ASSET_VERSION?.trim() || '2';
}

export function webflowRuntimeUrl(): string {
  return `${ASSETS_CDN_BASE}/js/webflow.js?v=${assetVersion()}`;
}

export function pagePathFromUrl(url: URL): string {
  return url.pathname;
}
