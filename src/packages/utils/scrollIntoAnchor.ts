export const scrollIntoAnchor = (anchor: string) =>
  document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' });
