// Build-time variables read by the layout and the /js/*-config.js endpoints.
// They come from the shell environment or from .env / .env.<mode> files that
// Astro loads for the selected --mode (see docs/astro-migration.md, section 6).
interface ImportMetaEnv {
  readonly LEAD_API_URL?: string;
  readonly SCHEDULE_API_URL?: string;
  readonly TRAFFIC_API_URL?: string;
  readonly ASSET_VERSION?: string;
  readonly Y_MAPS_API_KEY?: string;
}
