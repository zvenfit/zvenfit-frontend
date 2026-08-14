import type { TrafficClass } from './types';

const SYNTHETIC_RE = /zvenfit-synthetic-monitor|headlesschrome|playwright|puppeteer|cypress|selenium|webdriver/i;
const KNOWN_BOT_RE =
  /bot\b|crawler|spider|slurp|bingpreview|facebookexternalhit|vkshare|yandeximages|googleother|mail\.ru_bot/i;
const BROWSER_ENGINE_RE = /applewebkit|gecko\/|trident\//i;

export function classifyTraffic(userAgent: string, webdriver: boolean): TrafficClass {
  if (webdriver || SYNTHETIC_RE.test(userAgent)) {
    return 'synthetic';
  }
  if (KNOWN_BOT_RE.test(userAgent)) {
    return 'known_bot';
  }
  if (/mozilla\/5\.0/i.test(userAgent) && BROWSER_ENGINE_RE.test(userAgent)) {
    return 'browser_like';
  }

  return 'unknown';
}
