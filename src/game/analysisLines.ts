// Engine lines as the Analysis board shows them: eval text and the principal variation in SAN.
import { Chess } from 'chess.js';
import type { Score } from '../engine/types';

/** "+1.34", "-0.50", "0.00", "#5" (White mates), "#-5" (Black mates). White's point of view. */
export function formatEval(score: Score): string {
  if ('mate' in score) return `#${score.mate}`;
  const p = score.cp / 100;
  if (Math.abs(p) < 0.005) return '0.00';
  return p > 0 ? `+${p.toFixed(2)}` : p.toFixed(2);
}

/** A UCI line as numbered SAN ("12... Nf6 13. Bg5 h6"), up to `max` moves; stops at the first move that doesn't fit. */
export function pvToSan(fen: string, pv: string[], max = 12): string {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const [i, uci] of pv.slice(0, max).entries()) {
    const [, turn, , , , full] = chess.fen().split(' ');
    let san: string;
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
    } catch {
      break;
    }
    if (turn === 'w') out.push(`${full}. ${san}`);
    else out.push(i === 0 ? `${full}... ${san}` : san);
  }
  return out.join(' ');
}

const GLYPH: Record<number, string> = {
  1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!',
  10: '=', 13: '∞', 14: '⩲', 15: '⩱', 16: '±', 17: '∓', 18: '+−', 19: '−+',
};

/** A NAG as shown on the Analysis board: its glyph, or "$n" for the rarer ones. */
export function nagText(n: number): string {
  return GLYPH[n] ?? `$${n}`;
}
