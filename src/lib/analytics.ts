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
