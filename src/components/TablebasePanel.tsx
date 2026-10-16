import { useTablebase } from '../analysis/useTablebase';
import { distanceWords, tablebaseLine, type TbMove } from '../engine/tablebase';

const OUTCOME_STYLE: Record<TbMove['outcome'], string> = {
  win: 'bg-accent text-accent-ink',
  draw: 'bg-surface-2',
  loss: 'bg-danger text-white',
};

/** "Tablebase: White wins (DTZ 3, DTM 21)" plus each legal move and what it leads to. Hidden above 7 pieces. */
export function TablebasePanel({
  fen,
  onPlay,
  maxMoves = 8,
  showMoves = true,
}: {
  fen: string;
  /** Clicking a move plays it; without this the moves are plain text. */
  onPlay?: (uci: string) => void;
  maxMoves?: number;
  showMoves?: boolean;
}) {
  const tb = useTablebase(fen);
  if (!tb.covered) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="tablebase-panel">
      {tb.status === 'loading' && <p className="text-sm text-muted">Tablebase: looking up…</p>}
      {tb.status === 'unavailable' && <p className="text-sm text-muted">Tablebase unavailable (offline?)</p>}
      {tb.result && (
        <>
          <p className="text-sm font-semibold" data-testid="tablebase-verdict">{tablebaseLine(tb.result)}</p>
          {showMoves && tb.result.moves.length > 0 && (
            <ol className="flex flex-col gap-0.5" data-testid="tablebase-moves">
              {tb.result.moves.slice(0, maxMoves).map((m) => {
                const dist = distanceWords(m);
                const body = (
                  <>
                    <span className="w-14 shrink-0 font-mono text-sm">{m.san}</span>
                    <span className={`rounded px-1.5 text-xs font-semibold capitalize ${OUTCOME_STYLE[m.outcome]}`}>{m.outcome}</span>
                    {dist && <span className="ml-auto text-[10px] text-muted">{dist}</span>}
                  </>
                );
                return (
                  <li key={m.uci}>
                    {onPlay ? (
                      <button
                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2"
                        title="Play this move"
                        onClick={() => onPlay(m.uci)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-1 py-0.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
