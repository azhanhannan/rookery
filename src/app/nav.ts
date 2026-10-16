// The header's pages (src/components/SiteHeader.tsx renders them). Adding a page to the header is one line in
// NAV_ITEMS (plus its route in App.tsx).

export type NavItem = {
  /** Hash route; the entry is current on it and on anything below it (`#/review/<id>`). */
  href: string;
  label: string;
  /** Always shown in the bar (keep it to three: that is what fits on a 360 px phone). */
  primary?: boolean;
};

/** Every page in the header, in order. Non-primary entries go in the "More" menu (inline only on 2xl screens). */
export const NAV_ITEMS: NavItem[] = [
  { href: '#/play', label: 'Play', primary: true },
  { href: '#/review', label: 'Review', primary: true },
  { href: '#/puzzles', label: 'Puzzles', primary: true },
  { href: '#/analysis', label: 'Analysis' },
  { href: '#/openings', label: 'Openings' },
  { href: '#/endgames', label: 'Endgames' },
  { href: '#/drills', label: 'Drills' },
  { href: '#/lessons', label: 'Lessons' },
  { href: '#/import', label: 'Import' },
  { href: '#/about', label: 'About' },
];

/** Is `item` the page at `hash`? Play is also the start page (no hash). */
export function isCurrent(item: NavItem, hash: string): boolean {
  if (item.href === '#/play' && (hash === '' || hash === '#' || hash === '#/')) return true;
  return hash === item.href || hash.startsWith(`${item.href}/`);
}
