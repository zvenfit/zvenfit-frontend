// The legal link that points at the current page keeps the Webflow current
// state: aria-current="page" and the w--current class appended to its classes.
export function legalCurrent(path: string, href: string): 'page' | undefined {
  return path === href ? 'page' : undefined;
}

export function legalClass(path: string, href: string, base: string): string {
  return path === href ? `${base} w--current` : base;
}
