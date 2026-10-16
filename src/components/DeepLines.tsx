import { useTablebase } from '../analysis/useTablebase';
import { ANALYSIS } from '../config/tunables';
import { tablebaseLine } from '../engine/tablebase';
import type { AnalysisResult } from '../engine/types';
import { formatEval, pvToSan } from '../game/analysisLines';
import type { GameReview } from '../review/types';

/**
 * "Analyse deeper here", the extra part: the deeper search's top lines for the position before the move, and the
 * tablebase verdict before and after it when few enough pieces are left.
 */
export function DeepLines({ review, ply, analysis }: { review: GameReview; ply: number; analysis: AnalysisResult }) {
  const base = Math.max(0, ply - 1);
  const fenBefore = review.positions[base].fen;
  const fenAfter = ply > 0 ? review.positions[ply].fen : null;
  const move = ply > 0 ? review.moves[ply - 1] : undefined;
  const tbBefore = useTablebase(fenBefore);
  const tbAfter = useTablebase(fenAfter);
  const title = move
    ? `Top lines instead of ${Math.ceil(move.ply / 2)}${move.color === 'w' ? '.' : '...'} ${move.san}`
    : 'Top lines from the start';
  return (
    <div className="flex flex-col gap-1 border-t border-surface-2 pt-2" data-testid="deep-lines">
      <div className="text-xs font-semibold">
        {title} <span className="font-normal text-muted">(depth {analysis.depth})</span>
      </div>
      <ol className="flex flex-col gap-0.5">
        {analysis.lines.map((l) => (
          <li key={l.rank} className="flex min-w-0 items-baseline gap-2">
            <span className="w-14 shrink-0 rounded bg-surface-2 px-1 text-center font-mono text-xs font-semibold">
              {formatEval(l.score)}
            </span>
            <span className="truncate font-mono text-xs">{pvToSan(analysis.fen, l.pv, ANALYSIS.pvMoves)}</span>
          </li>
        ))}
      </ol>
      {tbBefore.covered && (
        <p className="text-xs" data-testid="deep-tablebase">
          {tbBefore.result
            ? `${move ? 'Before the move: ' : ''}${tablebaseLine(tbBefore.result)}`
            : tbBefore.status === 'loading'
              ? 'Tablebase: looking up…'
              : 'Tablebase unavailable (offline?)'}
          {move && tbAfter.result && (
            <>
              <br />
              After {move.san}: {tablebaseLine(tbAfter.result)}
            </>
          )}
        </p>
      )}
    </div>
  );
}
