// Runtime config for /js/maps-config.js. Organisation photos come from the
// committed snapshot src/data/map-photos.json (refreshed by `npm run
// maps:snapshot`); the build never touches the network.
import { structuredDataConfig, type LocationConfig } from './structured-data';
import mapsConfig from '../../scripts/maps.config.json';
import mapPhotos from '../data/map-photos.json';

interface LocationPin {
  pinIcon?: string;
  pinIconSize?: number[];
  pinIconOffset?: number[];
}

export interface MapsConfig {
  pinIcon: string;
  pinIconSize: number[];
  pinIconOffset: number[];
  locationPins?: Record<string, LocationPin>;
  locationOrganizations?: Record<string, string>;
  locationPhotos?: Record<string, string[]>;
  defaultSet: string;
  sets: Record<string, { locationKeys: string[]; zoom?: number; zoomMargin?: number }>;
  pageSets: Record<string, string>;
}

export const maps = mapsConfig as MapsConfig;
export const photosSnapshot = mapPhotos as Record<string, string[]>;

export function mapSetForPage(pagePath: string): string {
  return maps.pageSets[pagePath] ?? maps.defaultSet;
}

function yandexMapUrl(location: LocationConfig): string {
  return (
    location.sameAs?.find(url => url.includes('yandex.ru/maps')) ||
    `https://yandex.ru/maps/?ll=${location.longitude}%2C${location.latitude}&z=16&pt=${location.longitude},${location.latitude},pm2rdm`
  );
}

export function buildMapsRuntimeConfig(apiKey: string): Record<string, unknown> {
  const locations: Record<string, unknown> = {};
  for (const [key, location] of Object.entries(structuredDataConfig.locations)) {
    const pinOverride = maps.locationPins?.[key];
    locations[key] = {
      name: location.name,
      streetAddress: location.streetAddress,
      addressLocality: location.addressLocality,
      telephone: location.telephone,
      latitude: location.latitude,
      longitude: location.longitude,
      mapUrl: yandexMapUrl(location),
      yandexOrganizationId: maps.locationOrganizations?.[key] || '',
      pinIcon: pinOverride?.pinIcon || maps.pinIcon,
      pinIconSize: pinOverride?.pinIconSize || maps.pinIconSize,
      pinIconOffset: pinOverride?.pinIconOffset || maps.pinIconOffset,
      photos: photosSnapshot[key] ?? [],
    };
  }

  return {
    apiKey,
    pinIcon: maps.pinIcon,
    pinIconSize: maps.pinIconSize,
    pinIconOffset: maps.pinIconOffset,
    locationPins: maps.locationPins || {},
    locationOrganizations: maps.locationOrganizations || {},
    locationPhotos: photosSnapshot,
    defaultSet: maps.defaultSet,
    sets: maps.sets,
    locations,
  };
}
