// Site-wide constants shared by the layout, components and endpoints.
// The bucket addresses stay exactly as the legacy pages reference them until
// release B moves the vendor files into the repository.

export const SITE_URL = 'https://zvenfit.ru';
export const ASSETS_CDN_BASE = 'https://storage.yandexcloud.net/zvenfit/v2';
// `data-wf-site` of the Webflow export; the runtime and its interactions read it.
export const WEBFLOW_SITE_ID = '697f30b67cb029a39716bd07';

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

// Page path in the convention of the legacy build, which the content configs
// are keyed by (scripts/maps.config.json `pageSets`, structured data): Astro
// reports the 404 page as "/404/" while the legacy key is "/404.html".
export function pagePathFromUrl(url: URL): string {
  return url.pathname === '/404/' || url.pathname === '/404' ? '/404.html' : url.pathname;
}
