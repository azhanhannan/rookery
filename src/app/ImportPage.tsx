import { useState } from 'react';
import { useGameStore } from '../game/gameStore';

export function ImportPage() {
  const importPgn = useGameStore((s) => s.importPgn);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    try {
      importPgn(text);
      location.hash = '#/play';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">Import a game</h1>
      <p className="mb-4 text-sm text-muted">
        Paste one game in PGN. It replaces the game on the board; finished games are also saved to your history.
      </p>
      <textarea
        aria-label="PGN"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        rows={14}
        placeholder={'[Event "Casual game"]\n[White "Ana"]\n[Black "Ben"]\n\n1. e4 e5 2. Nf3 Nc6 *'}
        className="w-full rounded-lg border border-surface-2 bg-surface p-3 font-mono text-sm outline-accent"
      />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40"
          disabled={!text.trim()}
          onClick={submit}
        >
          Import
        </button>
        <a href="#/play" className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">Cancel</a>
      </div>
    </div>
  );
}
