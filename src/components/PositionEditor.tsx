import { useMemo, useState } from 'react';
import type { Orientation } from '../game/gameStore';
import {
  clampFullmove,
  EMPTY_FEN,
  fenFromSetup,
  PIECE_CODES,
  possibleCastling,
  setupFromFen,
  toggleSquare,
  validatePosition,
  type PieceCode,
  type Setup,
} from '../game/positionSetup';
import { START_FEN } from '../game/rules';
import { usePieceSet } from '../settings/pieceSet';
import { piecesFor } from './pieceRender';

const FILES = 'abcdefgh';
const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';

/**
 * A simple board editor: pick a piece (or the eraser) from the palette, click squares to place or remove it,
 * choose the side to move and castling rights. "Done" hands back a validated FEN.
 */
export function PositionEditor({
  initialFen,
  orientation,
  onDone,
  onCancel,
}: {
  initialFen: string;
  orientation: Orientation;
  onDone: (fen: string) => void;
  onCancel: () => void;
}) {
  const pieces = piecesFor(usePieceSet());
  const [setup, setSetup] = useState<Setup>(() => setupFromFen(initialFen));
  const [tool, setTool] = useState<PieceCode | null>('wP');
  // What is typed in the move-number box (null = show the setup's number), so it can be cleared while typing.
  const [moveDraft, setMoveDraft] = useState<string | null>(null);
  const fen = fenFromSetup(setup);
  const problem = useMemo(() => validatePosition(fen), [fen]);
  const allowed = possibleCastling(setup.placement);

  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? FILES.split('') : FILES.split('').reverse();

  const castleBox = (key: keyof Setup['castling'], label: string) => (
    <label className={`flex items-center gap-1.5 text-sm ${allowed[key] ? '' : 'opacity-40'}`}>
      <input
        type="checkbox"
        disabled={!allowed[key]}
        checked={setup.castling[key] && allowed[key]}
        onChange={(e) => setSetup({ ...setup, castling: { ...setup.castling, [key]: e.target.checked } })}
      />
      {label}
    </label>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="position-editor">
      <div className="grid aspect-square w-full max-w-md grid-cols-8 self-center overflow-hidden rounded" role="grid" aria-label="Board editor">
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = `${file}${rank}`;
            const dark = (FILES.indexOf(file) + rank) % 2 === 1;
            const p = setup.placement[sq];
            return (
              <button
                key={sq}
                data-square={sq}
                aria-label={p ? `${sq} ${p}` : sq}
                className="relative aspect-square"
                style={{ backgroundColor: dark ? 'var(--board-dark)' : 'var(--board-light)' }}
                onClick={() => setSetup({ ...setup, placement: toggleSquare(setup.placement, sq, tool) })}
              >
                {p && <span className="absolute inset-0">{pieces[p]?.()}</span>}
              </button>
            );
          }),
        )}
      </div>

      <div className="grid w-full max-w-md grid-cols-7 gap-1 self-center" role="radiogroup" aria-label="Piece to place">
        {PIECE_CODES.map((code) => (
          <button
            key={code}
            role="radio"
            aria-checked={tool === code}
            aria-label={`Place ${code}`}
            className={`aspect-square rounded p-0.5 ${tool === code ? 'bg-accent' : 'bg-surface-2'}`}
            onClick={() => setTool(code)}
          >
            {pieces[code]?.()}
          </button>
        ))}
        <button
          role="radio"
          aria-checked={tool === null}
          aria-label="Eraser"
          title="Eraser: click a square to empty it"
          className={`aspect-square rounded text-lg ${tool === null ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
          onClick={() => setTool(null)}
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          To move
          <select
            className="rounded bg-surface-2 px-2 py-1"
            value={setup.turn}
            onChange={(e) => setSetup({ ...setup, turn: e.target.value === 'b' ? 'b' : 'w' })}
          >
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Move
          <input
            type="number"
            min={1}
            className="w-16 rounded bg-surface-2 px-2 py-1"
            aria-label="Move number"
            data-testid="editor-move-number"
            value={moveDraft ?? String(setup.fullmove ?? 1)}
            onChange={(e) => {
              setMoveDraft(e.target.value);
              if (e.target.value.trim() !== '') setSetup({ ...setup, fullmove: clampFullmove(Number(e.target.value)) });
            }}
            onBlur={() => setMoveDraft(null)}
          />
        </label>
        {castleBox('K', 'White O-O')}
        {castleBox('Q', 'White O-O-O')}
        {castleBox('k', 'Black O-O')}
        {castleBox('q', 'Black O-O-O')}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => setSetup(setupFromFen(START_FEN))}>Start position</button>
        <button className={btn} onClick={() => setSetup(setupFromFen(EMPTY_FEN))}>Empty board</button>
      </div>

      <p className="font-mono text-xs break-all text-muted" data-testid="editor-fen">{fen}</p>
      {problem && <p className="text-sm text-danger" role="alert">{problem}</p>}
      <div className="flex gap-2">
        <button className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40" disabled={!!problem} onClick={() => onDone(fen)}>
          Analyse this position
        </button>
        <button className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
