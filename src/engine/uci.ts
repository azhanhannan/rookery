// Pure UCI text parsing. Stockfish scores are from the side to move; everything returned here
// that carries a score has already been flipped to White's point of view (SPEC: "Scores").
import type { Score } from './types';

export type InfoLine = {
  depth: number;
  /** 1-based; Stockfish omits it only when MultiPV is 1. */
  multipv: number;
  score: Score;
  pv: string[];
};

export type SpinOption = { name: string; default: number; min: number; max: number };

export function blackToMove(fen: string): boolean {
  return fen.trim().split(/\s+/)[1] === 'b';
}

/** Side-to-move score -> White's point of view. */
export function toWhitePov(score: Score, fen: string): Score {
  if (!blackToMove(fen)) return score;
  // `0 - x` rather than `-x` so a flipped 0 stays 0, not -0 (toEqual tells them apart).
  return 'cp' in score ? { cp: 0 - score.cp } : { mate: 0 - score.mate };
}

/**
 * A complete `info` line with a score and a PV, or null. Bound lines (`lowerbound`/`upperbound`)
 * are aspiration-window fail highs/lows, not final values, so they are dropped too.
 */
export function parseInfo(line: string, fen: string): InfoLine | null {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'info') return null;
  let depth: number | null = null;
  let multipv = 1;
  let score: Score | null = null;
  let pv: string[] = [];
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = Number(t[++i]);
        break;
      case 'multipv':
        multipv = Number(t[++i]);
        break;
      case 'score': {
        const kind = t[++i];
        const value = Number(t[++i]);
        if (kind === 'cp') score = { cp: value };
        else if (kind === 'mate') score = { mate: value };
        break;
      }
      case 'lowerbound':
      case 'upperbound':
        return null;
      case 'pv':
        pv = t.slice(i + 1);
        i = t.length;
        break;
      case 'string':
        return null;
    }
  }
  if (depth === null || score === null || pv.length === 0) return null;
  return { depth, multipv, score: toWhitePov(score, fen), pv };
}

/** `bestmove e2e4 [ponder e7e5]` -> "e2e4"; `bestmove (none)` -> null; not a bestmove line -> undefined. */
export function parseBestMove(line: string): string | null | undefined {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'bestmove') return undefined;
  return !t[1] || t[1] === '(none)' ? null : t[1];
}

/** `option name X type spin default D min A max B`. Option names may contain spaces. */
export function parseSpinOption(line: string): SpinOption | null {
  const m = /^option name (.+?) type spin default (-?\d+) min (-?\d+) max (-?\d+)/.exec(line.trim());
  if (!m) return null;
  return { name: m[1], default: Number(m[2]), min: Number(m[3]), max: Number(m[4]) };
}
