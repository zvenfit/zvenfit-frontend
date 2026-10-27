// Shapes of scripts/structured-data.config.json and of the JSON-LD nodes.

export interface OpeningHours {
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

export interface LocationConfig {
  id: string;
  name: string;
  alternateName?: string;
  description: string;
  url?: string;
  telephone: string;
  email: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  addressCountry: string;
  latitude: number;
  longitude: number;
  openingHours?: OpeningHours[];
  sameAs?: string[];
}

export interface ServiceConfig {
  name: string;
  description?: string;
}

export interface PageConfig {
  primaryLocation?: string;
  services?: ServiceConfig[];
}

export interface PromoOffer {
  id?: string;
  name: string;
  description?: string;
  url?: string;
  price?: number;
  priceCurrency?: string;
}

export interface PromosPage {
  itemListName?: string;
  offers?: PromoOffer[];
}

export interface TrainerConfig {
  name: string;
  jobTitle: string;
  location?: string;
}

export interface StructuredDataConfig {
  siteUrl: string;
  organization: { name: string; logo?: string; sameAs?: string[] };
  trialOffer?: { name: string; price: number; priceCurrency?: string };
  openGraph?: { image?: string; siteName?: string };
  promosPages?: Record<string, PromosPage>;
  breadcrumbSkipSegments?: string[];
  breadcrumbLabels?: Record<string, string>;
  locations: Record<string, LocationConfig>;
  pages?: Record<string, PageConfig>;
  trainers?: Record<string, TrainerConfig>;
}

export type JsonLd = Record<string, unknown>;

export interface PageMeta {
  title: string;
  description: string;
}
