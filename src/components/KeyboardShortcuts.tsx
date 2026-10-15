import { useEffect, useState } from 'react';
import { shortcutsFor, type ShortcutPage } from './boardKeys';

/** A "?" button (and the "?" key) that opens a small sheet of the page's keyboard shortcuts. */
export function KeyboardShortcuts({ page, className, withText = false }: { page: ShortcutPage; className?: string; withText?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        return;
      }
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={className ?? 'rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent'}
        onClick={() => setOpen(true)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        data-testid="shortcuts-button"
      >
        ?{withText && <span className="ml-1.5">Keyboard shortcuts</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Keyboard shortcuts"
            data-testid="shortcuts-sheet"
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 font-semibold">Keyboard shortcuts</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {shortcutsFor(page).map(([keys, what]) => (
                <div key={keys} className="contents">
                  <dt>
                    <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                  </dt>
                  <dd className="text-muted">{what}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent"
              onClick={() => setOpen(false)}
              autoFocus
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
