// "Full screen" for Play, Review and Puzzles: hides the site header and asks the browser for fullscreen, so the board
// gets the whole screen. Where the browser refuses fullscreen (some phones), the header is still hidden.
// Esc (or the browser's own exit) leaves it.
import { create } from 'zustand';

type FocusState = { on: boolean; toggle(): void; exit(): void };

function requestFullscreen(): void {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function leaveFullscreen(): void {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

export const useFocusMode = create<FocusState>((set, get) => ({
  on: false,
  toggle() {
    if (get().on) get().exit();
    else {
      set({ on: true });
      requestFullscreen();
    }
  },
  exit() {
    set({ on: false });
    leaveFullscreen();
  },
}));

if (typeof document !== 'undefined') {
  // The browser left fullscreen (Esc, F11, its own button): leave focus mode with it.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && useFocusMode.getState().on) useFocusMode.setState({ on: false });
  });
  // Esc when fullscreen was refused (in fullscreen the browser consumes Esc and fires fullscreenchange).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && useFocusMode.getState().on && !document.fullscreenElement) useFocusMode.getState().exit();
  });
}
