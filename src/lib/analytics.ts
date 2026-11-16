// Third-party analytics markup is rendered only in production builds.
// GTM blocks are wrapped in the comment style each legacy page used.

export type GtmStyle = 'commented' | 'single-space' | 'bare' | false;

export function wrapGtm(style: Exclude<GtmStyle, false>, inner: string, label: string): string {
  if (style === 'bare') {
    return inner;
  }
  const pad = style === 'commented' ? '  ' : ' ';

  return `<!--${pad}Google Tag Manager${label}${pad}-->\n  ${inner}\n  <!--${pad}End Google Tag Manager${label}${pad}-->`;
}

// The club card page gave its GTM noscript frame a title; every other page has none.
export function withFrameTitle(noscript: string, title?: string): string {
  if (!title) {
    return noscript;
  }
  const marker = '></iframe>';
  if (!noscript.includes(marker)) {
    throw new Error('analytics: the GTM noscript snippet has no iframe to title');
  }

  const escaped = title.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  return noscript.replace(marker, ` title="${escaped}"${marker}`);
}
