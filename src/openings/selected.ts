// The repertoire the Openings page shows, remembered per device. Kept apart from the page (which is lazy-loaded)
// so a reminder elsewhere can pick a repertoire before linking to it.
const SELECTED_KEY = 'rookery.openings.selected';

export function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function writeSelected(id: string | null): void {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    // ignore: the choice just won't survive a reload
  }
}
