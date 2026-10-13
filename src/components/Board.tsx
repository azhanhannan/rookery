import { useMemo, useState, type CSSProperties } from 'react';
import { Chessboard, defaultPieces, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard';
import { useGameStore } from '../game/gameStore';
import { botColor, legalTargets, needsPromotion, replay } from '../game/rules';

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const;

function kingSquare(board: ReturnType<ReturnType<typeof replay>['board']>, color: 'w' | 'b'): string | null {
  for (const row of board) for (const p of row) if (p?.type === 'k' && p.color === color) return p.square;
  return null;
}

export function Board() {
  const record = useGameStore((s) => s.record);
  const viewPly = useGameStore((s) => s.viewPly);
  const orientation = useGameStore((s) => s.orientation);
  const move = useGameStore((s) => s.move);

  const chess = useMemo(() => replay(record, viewPly), [record, viewPly]);
  const turn = chess.turn();
  // Against a bot the human only moves on their own turn; on the bot's turn (thinking or failed) nothing moves.
  const live = viewPly === record.moves.length && record.result === '*' && turn !== botColor(record);

  // Selection belongs to one position; a new position (move played, or stepping through the list) clears it.
  const positionKey = `${record.id}:${viewPly}:${record.moves.length}`;
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
    return move({ from, to });
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
    const last = record.moves[viewPly - 1];
    if (last) {
      styles[last.uci.slice(0, 2)] = { backgroundColor: 'var(--last-move)' };
      styles[last.uci.slice(2, 4)] = { backgroundColor: 'var(--last-move)' };
    }
    if (chess.inCheck()) {
      const k = kingSquare(chess.board(), turn);
      if (k) styles[k] = { backgroundImage: 'radial-gradient(circle, var(--check) 0%, transparent 72%)' };
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
  }, [chess, record.moves, viewPly, selected, targets, turn]);

  return (
    <div className="relative w-full" data-testid="board">
      <Chessboard
        options={{
          id: 'main-board',
          position: chess.fen(),
          boardOrientation: orientation,
          allowDragging: live,
          canDragPiece: ({ piece }) => live && piece.pieceType[0] === turn,
          onPieceDrop,
          onSquareClick,
          onPieceDrag: ({ square }) => square && setSel({ key: positionKey, square }),
          squareStyles,
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
                      move({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: p });
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
