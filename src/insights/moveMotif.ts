// The motif of one own move, by the same rules `buildGameFacts` files moves under (pure). Lets My mistakes
// filter its puzzles by motif ("Train this") without building facts for every game.
import type { Color, GameRecord } from '../game/types';
import { captionFact, captionInputFor } from '../review/captions';
import { reviewFits } from '../review/reviewView';
import { motifFor, newThreat } from './motifs';
import type { Motif } from './types';

/** The motif of the move at `ply` played by `color`; 'other' when nothing is proven, a book move, or no fitting review. */
export function moveMotif(record: GameRecord, ply: number, color: Color): Motif {
  if (!reviewFits(record, record.review)) return 'other';
  const review = record.review;
  const m = review.moves[ply - 1];
  if (!m || m.color !== color || ply <= (review.opening?.bookPlies ?? 0)) return 'other';
  const input = captionInputFor(review, ply);
  if (!input) return 'other';
  const fens = review.positions.map((p) => p.fen);
  const threat = newThreat(fens[ply - 2], fens[ply - 1], color);
  return (
    motifFor({
      fact: captionFact(input),
      fenBefore: fens[ply - 1],
      fenAfter: fens[ply],
      lineAfter: input.lineAfter,
      me: color,
      winBefore: m.winBefore,
      loss: m.loss,
      threat,
    }) ?? 'other'
  );
}
