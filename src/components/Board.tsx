import { useMemo, useState, type CSSProperties } from 'react';
import { Chessboard, defaultPieces, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useGameStore, type Orientation } from '../game/gameStore';
import { botColor, legalTargets, needsPromotion, replay, type MoveInput } from '../game/rules';

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const;

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
};

/**
 * The live game from the store when given no props; otherwise a controlled board for any position
 * (the review screen), read-only unless `movable` is set.
 */
export function Board(props: Partial<BoardViewProps> & { position?: string }) {
  if (props.position === undefined) return <StoreBoard />;
  return <BoardView orientation="white" {...props} position={props.position} />;
}

function StoreBoard() {
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
}: BoardViewProps) {
  const chess = useMemo(() => new Chess(position), [position]);
  const turn = chess.turn();
  const live = movable && !!onMove;

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
    if (!live || !targetSquare || sourceSquare === targetSquare) return false;
    return attempt(sourceSquare, targetSquare);
  }

  function onSquareClick({ piece, square }: SquareHandlerArgs) {
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
    if (lastMove) {
      const backgroundColor = lastMove.color ?? 'var(--last-move)';
      styles[lastMove.from] = { backgroundColor };
      styles[lastMove.to] = { backgroundColor };
    }
    if (chess.inCheck()) {
      const k = kingSquare(chess.board(), turn);
      if (k) styles[k] = { ...styles[k], backgroundImage: 'radial-gradient(circle, var(--check) 0%, transparent 72%)' };
    }
    if (selected) styles[selected] = { ...styles[selected], backgroundColor: 'var(--selected)' };
    for (const t of targets) {
      const occupied = chess.get(t as Parameters<typeof chess.get>[0]);
      styles[t] = {
        ...styles[t],
        backgroundImage: occupied
          ? 'radial-gradient(circle, transparent 58%, var(--dot) 60%)'
          : 'radial-gradient(circle, var(--dot) 22%, transparent 24%)',
        cursor: 'pointer',
      };
    }
    return styles;
  }, [chess, lastMove, selected, targets, turn]);

  return (
    <div className="relative w-full" data-testid="board">
      <Chessboard
        options={{
          id,
          position,
          boardOrientation: orientation,
          allowDragging: live,
          canDragPiece: ({ piece }) => live && piece.pieceType[0] === turn,
          onPieceDrop,
          onSquareClick,
          onPieceDrag: ({ square }) => square && setSel({ key: positionKey, square }),
          squareStyles,
          // Boards with app-drawn arrows don't mix in hand-drawn ones.
          ...(arrows ? { arrows, allowDrawingArrows: false } : {}),
          lightSquareStyle: { backgroundColor: 'var(--board-light)' },
          darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
          animationDurationInMs: 150,
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
                    {defaultPieces[key]?.()}
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
