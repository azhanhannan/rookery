// Hand-written review of a 20-ply game (Smith-Morra Gambit, Siberian trap: 10...Qh2#), for UI work and tests
// while the real pipeline is built. Every label appears at least once; numbers follow the SPEC rules closely
// enough to look real, but they are made up, not engine output.
import { Chess } from 'chess.js';
import type { Score } from '../../src/engine/types';
import type { GameRecord } from '../../src/game/types';
import type { GameReview, MoveLabel, MoveReview, PlayerSummary, PositionReview } from '../../src/review/types';

type Row = {
  san: string;
  label: MoveLabel;
  /** White's win chance after the move. */
  winWhite: number;
  /** Engine's line in the position before the move (first move = best move). */
  bestLine: string[];
  explanation: string;
};

const ROWS: Row[] = [
  { san: 'e4', label: 'Book', winWhite: 54, bestLine: ['e2e4', 'c7c5', 'g1f3'], explanation: 'Book: a well-known opening move.' },
  { san: 'c5', label: 'Book', winWhite: 56, bestLine: ['c7c5', 'g1f3', 'd7d6'], explanation: 'Book: a well-known opening move.' },
  { san: 'd4', label: 'Book', winWhite: 53, bestLine: ['d2d4', 'c5d4', 'c2c3'], explanation: 'Book: a well-known opening move.' },
  { san: 'cxd4', label: 'Book', winWhite: 55, bestLine: ['c5d4', 'c2c3', 'd4c3'], explanation: 'Book: a well-known opening move.' },
  { san: 'c3', label: 'Book', winWhite: 52, bestLine: ['c2c3', 'd4c3', 'b1c3'], explanation: 'Book: a well-known opening move.' },
  { san: 'dxc3', label: 'Book', winWhite: 54, bestLine: ['d4c3', 'b1c3', 'b8c6'], explanation: 'Book: a well-known opening move.' },
  { san: 'Nxc3', label: 'Book', winWhite: 60, bestLine: ['b1c3', 'b8c6', 'g1f3'], explanation: 'Book: a well-known opening move.' },
  { san: 'Nc6', label: 'Best', winWhite: 59, bestLine: ['b8c6', 'g1f3', 'd7d6'], explanation: 'Best: the engine\'s top move.' },
  { san: 'Nf3', label: 'Good', winWhite: 56, bestLine: ['f1c4', 'e7e6', 'g1f3'], explanation: 'Good: a solid move. Best was Bc4.' },
  { san: 'e6', label: 'Excellent', winWhite: 57, bestLine: ['d7d6', 'f1c4', 'e7e6'], explanation: 'Excellent: nearly as good as the best move, d6.' },
  { san: 'Bc4', label: 'Inaccuracy', winWhite: 50, bestLine: ['f1b5', 'g8e7', 'e1g1'], explanation: 'Inaccuracy: this gave Black an easier game. Best was Bb5.' },
  { san: 'Qc7', label: 'Best', winWhite: 49, bestLine: ['d8c7', 'e1g1', 'g8f6'], explanation: 'Best: the engine\'s top move.' },
  { san: 'O-O', label: 'Mistake', winWhite: 35, bestLine: ['c3b5', 'c7b8', 'e1g1'], explanation: 'Mistake: this let the black pieces in on the kingside. Best was Nb5.' },
  { san: 'Nf6', label: 'Miss', winWhite: 47, bestLine: ['c6e5', 'f3e5', 'c7e5'], explanation: 'Miss: White\'s last move left a chance and this didn\'t take it. Best was Ne5.' },
  { san: 'Qe2', label: 'Good', winWhite: 43, bestLine: ['e4e5', 'f6g4', 'd1e2'], explanation: 'Good: a reasonable move. Best was e5.' },
  { san: 'Ng4', label: 'Brilliant', winWhite: 44, bestLine: ['f6g4', 'h2h3', 'c6d4'], explanation: 'Brilliant: the knight can be taken, but taking it loses.' },
  { san: 'h3', label: 'Blunder', winWhite: 20, bestLine: ['g2g3', 'c6d4', 'f3d4'], explanation: 'Blunder: this let Black set up a mate. Best was g3.' },
  { san: 'Nd4', label: 'Great', winWhite: 21, bestLine: ['c6d4', 'e2d1', 'd4f3'], explanation: 'Great: the only move that keeps the attack going.' },
  { san: 'Nxd4', label: 'Blunder', winWhite: 0, bestLine: ['e2d1', 'd4f3', 'g2f3'], explanation: 'Blunder: this allowed mate in 1. Best was Qd1.' },
  { san: 'Qh2#', label: 'Best', winWhite: 0, bestLine: ['c7h2'], explanation: 'Best: checkmate.' },
];

const START_WIN_WHITE = 52;

/** Inverse of the Lichess win-chance curve, so each score matches its winWhite. */
function cpFor(winWhite: number): number {
  return Math.round(-Math.log(100 / winWhite - 1) / 0.00368208) || 0; // no -0: it would not survive JSON
}

function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

function summary(moves: MoveReview[]): PlayerSummary {
  const counts = Object.fromEntries(
    (['Book', 'Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder', 'Miss'] as MoveLabel[]).map(
      (l) => [l, 0],
    ),
  ) as Record<MoveLabel, number>;
  for (const m of moves) counts[m.label]++;
  if (moves.length === 0) return { accuracy: null, moves: 0, counts };
  const accs = moves.map((m) => m.accuracy);
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
  const harmonic = accs.length / accs.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return { accuracy: (mean + harmonic) / 2, moves: moves.length, counts };
}

function build(): { record: GameRecord; review: GameReview } {
  const chess = new Chess();
  const positions: PositionReview[] = [];
  const recordMoves: GameRecord['moves'] = [];
  const moves: MoveReview[] = [];

  let winWhite = START_WIN_WHITE;
  ROWS.forEach((row, i) => {
    const fenBefore = chess.fen();
    const score: Score = { cp: cpFor(winWhite) };
    positions.push({ fen: fenBefore, score, winWhite, bestMove: row.bestLine[0], bestLine: row.bestLine });

    const color = chess.turn();
    const best = new Chess(fenBefore).move(row.bestLine[0]);
    const m = chess.move(row.san);
    const uci = m.from + m.to + (m.promotion ?? '');
    recordMoves.push({ san: m.san, uci, fenAfter: chess.fen() });

    const mover = (w: number) => (color === 'w' ? w : 100 - w);
    const winBefore = mover(winWhite);
    const winAfter = mover(row.winWhite);
    const loss = Math.max(0, winBefore - winAfter);
    moves.push({
      ply: i + 1,
      color,
      san: m.san,
      uci,
      label: row.label,
      winBefore,
      winAfter,
      loss,
      accuracy: moveAccuracy(loss),
      bestMove: row.bestLine[0],
      bestSan: best.san,
      explanation: row.explanation,
    });
    winWhite = row.winWhite;
  });

  // After 19.Nxd4 Black mates in 1; after 20...Qh2# the game is over (no score, no best move).
  positions[19].score = { mate: -1 };
  positions.push({ fen: chess.fen(), winWhite: 0, bestLine: [] });

  const review: GameReview = {
    version: 2,
    depth: 16,
    createdAt: '2026-10-13T09:00:00.000Z',
    positions,
    moves,
    opening: { bookPlies: 7, eco: 'B21', name: 'Sicilian Defense: Smith-Morra Gambit Accepted' },
    white: summary(moves.filter((m) => m.color === 'w')),
    black: summary(moves.filter((m) => m.color === 'b')),
  };

  const record: GameRecord = {
    id: 'sample-review-game',
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: recordMoves,
    white: { name: 'You', isBot: false },
    black: { name: 'Bot 1200', isBot: true, elo: 1200 },
    result: '0-1',
    termination: 'checkmate',
    createdAt: '2026-10-13T08:40:00.000Z',
  };
  return { record, review };
}

const built = build();

/** The finished game, without its review. */
export const SAMPLE_RECORD: GameRecord = built.record;
export const SAMPLE_REVIEW: GameReview = built.review;
/** The same game with the review attached, as it is stored after a review run. */
export const SAMPLE_REVIEWED_RECORD: GameRecord = { ...built.record, review: built.review };
