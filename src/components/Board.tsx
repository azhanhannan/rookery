import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useGameStore, type Orientation } from '../game/gameStore';
import { botColor, legalTargets, needsPromotion, replay, type MoveInput } from '../game/rules';
import { usePieceSet } from '../settings/pieceSet';
import { animationMs } from '../settings/playSettings';
import { mergeSquareStyles, useBoardMarks } from './boardMarks';
import { piecesFor } from './pieceRender';

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const;

/** Pixels a finger or mouse must travel before a press becomes a drag, so a slightly wobbly tap stays a tap. */
const DRAG_START_PX = 6;
/** How long after the pointer lifts the board may take to report the drag's end before it is reset. */
const STUCK_DRAG_MS = 150;

/**
 * react-chessboard can lose the end of a drag: when a drag starts and the pointer lifts within the same frame,
 * dnd-kit fires neither drop nor cancel, and the piece stays dimmed and unusable until a reload. Track the drag
 * ourselves, and when the pointer is up with no drop or cancel reported, remount the board (a new `key`).
 */
function useStuckDragReset() {
  const dragging = useRef(false);
  const [boardKey, setBoardKey] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUp = () => {
      if (!dragging.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!dragging.current) return;
        dragging.current = false;
        setBoardKey((k) => k + 1);
      }, STUCK_DRAG_MS);
    };
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, []);
  return {
    boardKey,
    started: () => {
      dragging.current = true;
    },
    ended: () => {
      dragging.current = false;
    },
  };
}

function kingSquare(board: ReturnType<Chess['board']>, color: 'w' | 'b'): string | null {
  for (const row of board) for (const p of row) if (p?.type === 'k' && p.color === color) return p.square;
  return null;
}

export type BoardArrow = { startSquare: string; endSquare: string; color: string };

type BoardViewProps = {
  /** FEN shown on the board. */
  position: string;
  orientation: Orientation;
  /** The move that led to this position, highlighted; `color` overrides the usual yellow. */
  lastMove?: { from: string; to: string; color?: string } | null;
  arrows?: BoardArrow[];
  /** Whether the side to move may play on the board. */
  movable?: boolean;
  /** A move attempt from the board; return false to snap the piece back. */
  onMove?: (input: MoveInput) => boolean;
  /** Changes whenever the position does, so a selection never outlives its position. Defaults to the FEN. */
  positionKey?: string;
  id?: string;
  /** Extra per-square styles merged on top of the board's own (e.g. Practice glows). */
  squareStyles?: Record<string, CSSProperties>;
  /** A small marker drawn in the top-right corner of one square (Review's label badge). */
  squareBadge?: { square: string; node: ReactNode } | null;
  /**
   * Premove input (Settings → Play → Premoves): while the board is not movable, `color`'s pieces can still be
   * clicked or dragged, and the move goes to `onQueue` instead of `onMove` (app/usePremove.ts plays it later).
   */
  premove?: { color: 'w' | 'b'; onQueue: (from: string, to: string) => void };
};

/**
 * The live game from the store when given no props; otherwise a controlled board for any position
 * (the review screen), read-only unless `movable` is set.
 */
export function Board(props: Partial<BoardViewProps> & { position?: string }) {
  if (props.position === undefined) return <StoreBoard arrows={props.arrows} squareStyles={props.squareStyles} premove={props.premove} />;
  return <BoardView orientation="white" {...props} position={props.position} />;
}

function StoreBoard({ arrows, squareStyles: extraStyles, premove }: Pick<BoardViewProps, 'arrows' | 'squareStyles' | 'premove'> = {}) {
  const record = useGameStore((s) => s.record);
  const viewPly = useGameStore((s) => s.viewPly);
  const orientation = useGameStore((s) => s.orientation);
  const move = useGameStore((s) => s.move);

  const fen = useMemo(() => replay(record, viewPly).fen(), [record, viewPly]);
  const turn = fen.split(' ')[1];
  // Against a bot the human only moves on their own turn; on the bot's turn (thinking or failed) nothing moves.
  const live = viewPly === record.moves.length && record.result === '*' && turn !== botColor(record);
  const last = record.moves[viewPly - 1];
  const lastMove = useMemo(() => (last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null), [last]);

  return (
    <BoardView
      id="main-board"
      position={fen}
      orientation={orientation}
      lastMove={lastMove}
      movable={live}
      onMove={move}
      positionKey={`${record.id}:${viewPly}:${record.moves.length}`}
      arrows={arrows}
      squareStyles={extraStyles}
      premove={premove}
    />
  );
}

function BoardView({
  position,
  orientation,
  lastMove,
  arrows,
  movable = false,
  onMove,
  positionKey = position,
  id = 'board',
  squareStyles: extraStyles,
  squareBadge,
  premove,
}: BoardViewProps) {
  const pieceSet = usePieceSet();
  const pieces = useMemo(() => piecesFor(pieceSet), [pieceSet]);
  const chess = useMemo(() => new Chess(position), [position]);
  const turn = chess.turn();
  const live = movable && !!onMove;
  // Premove input only while the board can't move (the opponent's turn).
  const pre = !live && premove ? premove : null;
  const marks = useBoardMarks(positionKey);
  const shown = marks.settings;
  const drag = useStuckDragReset();

  // Selection belongs to one position; a new position (move played, or stepping through the list) clears it.
  const [sel, setSel] = useState<{ key: string; square: string } | null>(null);
  const [promo, setPromo] = useState<{ key: string; from: string; to: string } | null>(null);
  const selected = sel?.key === positionKey ? sel.square : null;
  const pendingPromotion = promo?.key === positionKey ? promo : null;

  const targets = useMemo(() => (selected ? legalTargets(chess, selected) : []), [chess, selected]);

  function attempt(from: string, to: string): boolean {
    setSel(null);
    if (needsPromotion(chess, from, to)) {
      setPromo({ key: positionKey, from, to });
      return false;
    }
    return onMove ? onMove({ from, to }) : false;
  }

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    drag.ended();
    if (pre) {
      setSel(null);
      if (targetSquare && sourceSquare !== targetSquare) pre.onQueue(sourceSquare, targetSquare);
      return false;
    }
    if (!live || !targetSquare || sourceSquare === targetSquare) return false;
    return attempt(sourceSquare, targetSquare);
  }

  function onSquareClick({ piece, square }: SquareHandlerArgs) {
    if (pre) {
      if (piece && piece.pieceType[0] === pre.color && square !== selected) setSel({ key: positionKey, square });
      else {
        if (selected && square !== selected) pre.onQueue(selected, square);
        setSel(null);
      }
      return;
    }
    if (!live) return;
    if (selected && targets.includes(square)) {
      attempt(selected, square);
      return;
    }
    if (piece && piece.pieceType[0] === turn && square !== selected) {
      setSel({ key: positionKey, square });
    } else {
      setSel(null);
    }
  }

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    // A coloured "last move" is a marker (the puzzle hint), shown even with the highlight off.
    if (lastMove && (shown.lastMove || lastMove.color)) {
      const backgroundColor = lastMove.color ?? 'var(--last-move)';
      styles[lastMove.from] = { backgroundColor };
      styles[lastMove.to] = { backgroundColor };
    }
    if (chess.inCheck()) {
      const k = kingSquare(chess.board(), turn);
      if (k) styles[k] = { ...styles[k], backgroundImage: 'radial-gradient(circle, var(--check) 0%, transparent 72%)' };
    }
    if (selected) styles[selected] = { ...styles[selected], backgroundColor: 'var(--selected)' };
    for (const t of shown.legalDots ? targets : []) {
      const occupied = chess.get(t as Parameters<typeof chess.get>[0]);
      styles[t] = {
        ...styles[t],
        backgroundImage: occupied
          ? 'radial-gradient(circle, transparent 58%, var(--dot) 60%)'
          : 'radial-gradient(circle, var(--dot) 22%, transparent 24%)',
        cursor: 'pointer',
      };
    }
    if (extraStyles) for (const [sq, st] of Object.entries(extraStyles)) styles[sq] = { ...styles[sq], ...st };
    return styles;
  }, [chess, lastMove, selected, targets, turn, extraStyles, shown.lastMove, shown.legalDots]);

  const allStyles = mergeSquareStyles(squareStyles, marks.circleStyles);

  return (
    <div className="relative w-full" data-testid="board">
      <Chessboard
        key={drag.boardKey}
        options={{
          id,
          position,
          boardOrientation: orientation,
          allowDragging: live || !!pre,
          canDragPiece: ({ piece }) => (pre ? piece.pieceType[0] === pre.color : live && piece.pieceType[0] === turn),
          onPieceDrop,
          onSquareClick,
          onPieceDrag: ({ square }) => {
            drag.started();
            if (square) setSel({ key: positionKey, square });
          },
          onPieceDragCancel: drag.ended,
          dragActivationDistance: DRAG_START_PX,
          squareStyles: allStyles,
          // App-drawn arrows (review) and hand-drawn ones (right-drag) share the board.
          ...(arrows ? { arrows } : {}),
          ...marks.options,
          showNotation: shown.coordinates,
          showAnimations: animationMs(shown) > 0,
          ...(squareBadge
            ? {
                squareRenderer: ({ square, children }: { square: string; children?: ReactNode }) => (
                  <div style={{ width: '100%', height: '100%', position: 'relative', ...allStyles[square] }}>
                    {children}
                    {square === squareBadge.square && (
                      <div
                        data-testid="square-badge"
                        style={{ position: 'absolute', top: '2%', right: '2%', zIndex: 5, pointerEvents: 'none' }}
                      >
                        {squareBadge.node}
                      </div>
                    )}
                  </div>
                ),
              }
            : {}),
          // Textured themes set --board-image and make the squares transparent (settings/boardTheme.ts).
          boardStyle: { backgroundImage: 'var(--board-image, none)', backgroundSize: '100% 100%' },
          lightSquareStyle: { backgroundColor: 'var(--board-square-light, var(--board-light))' },
          darkSquareStyle: { backgroundColor: 'var(--board-square-dark, var(--board-dark))' },
          // Coordinates in the other square colour, so they follow the board theme.
          lightSquareNotationStyle: { color: 'var(--board-dark)' },
          darkSquareNotationStyle: { color: 'var(--board-light)' },
          animationDurationInMs: animationMs(shown),
          pieces,
        }}
      />
      {pendingPromotion && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-surface p-3 shadow-xl" role="dialog" aria-label="Choose promotion piece">
            <div className="mb-2 text-center text-sm text-muted">Promote to</div>
            <div className="flex gap-2">
              {PROMOTION_PIECES.map((p) => {
                const key = `${turn}${p.toUpperCase()}`;
                return (
                  <button
                    key={p}
                    aria-label={`Promote to ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[p]}`}
                    className="h-16 w-16 rounded-lg bg-surface-2 p-1 hover:outline-2 hover:outline-accent"
                    onClick={() => {
                      setPromo(null);
                      onMove?.({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: p });
                    }}
                  >
                    {pieces[key]?.()}
                  </button>
                );
              })}
            </div>
            <button className="mt-2 w-full text-sm text-muted hover:text-ink" onClick={() => setPromo(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
