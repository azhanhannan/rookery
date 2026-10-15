/**
 * Scrolls `el` into view inside its nearest scrollable ancestor only. `scrollIntoView` would also scroll the
 * page, pulling the board out of view whenever the move list sits below it.
 */
export function scrollWithin(el: HTMLElement | null): void {
  if (!el) return;
  let box = el.parentElement;
  while (box && box !== document.body) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === 'auto' || overflowY === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop += r.top - b.top;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
}
