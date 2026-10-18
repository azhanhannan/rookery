// Reviewed games for the Insights page (unit and e2e): each one has the player (White, against a bot) leave a
// knight hanging on h4 at ply 5 (1.e4 e5 2.Nf3 Nc6 3.Nh4?? — Qxh4 takes it for free), then quiet knight moves.
import type { GameRecord, GameResult } from '../../src/game/types';
import { makeGame, shuffleSans } from './insights';

/** 1.e4 e5 2.Nf3 Nc6 3.Nh4 Nf6, then the knights shuffle; `plies` long. */
export function hangingSans(plies = 26): string[] {
  const head = ['e4', 'e5', 'Nf3', 'Nc6', 'Nh4', 'Nf6'];
  const cycle = ['Nf3', 'Ng8', 'Ng1', 'Nf6'];
  return [...head, ...Array.from({ length: Math.max(0, plies - head.length) }, (_, i) => cycle[i % 4])];
}

const RESULTS: GameResult[] = ['0-1', '1/2-1/2', '1-0'];

/** Game `i` of a series: one day apart from 1 Oct 2026, reviewed at depth 16. */
export function hangingGame(i: number, opts: { createdAt?: string; reviewCreatedAt?: string } = {}): GameRecord {
  const createdAt = opts.createdAt ?? new Date(Date.UTC(2026, 9, 1 + i, 10)).toISOString();
  const g = makeGame({
    id: `hang-${i}`,
    sans: hangingSans(),
    // White's win chance: even, then 20% from the blunder on (a 30-point loss at ply 5).
    wins: (index) => (index < 5 ? 50 : 20),
    // Before the blunder the engine wanted Bb5; after it, Qxh4 (the witness for the caption).
    engine: { 4: { bestMove: 'f1b5' }, 5: { bestMove: 'd8h4', bestLine: ['d8h4'] } },
    result: RESULTS[i % 3],
    termination: 'agreement',
    createdAt,
    endedAt: createdAt,
  });
  if (g.review && opts.reviewCreatedAt) g.review = { ...g.review, createdAt: opts.reviewCreatedAt };
  return { ...g, white: { name: 'You', isBot: false }, black: { name: 'Bot 1100', isBot: true, elo: 1100 } };
}

/** `n` such games, newest first (the order `rookery.games` keeps). */
export function hangingGames(n: number): GameRecord[] {
  return Array.from({ length: n }, (_, i) => hangingGame(i)).reverse();
}

/**
 * Game `i` of a series won against a Maia bot from a clearly winning position: even until ply 12, then White at
 * 75% for the rest (a conversion episode, never a slip). Quiet knight moves, reviewed at depth 16 (format 2).
 */
export function maiaConversionGame(i: number): GameRecord {
  const createdAt = new Date(Date.UTC(2026, 9, 1 + i, 14)).toISOString();
  const g = makeGame({
    id: `maia-${i}`,
    sans: shuffleSans(26),
    wins: (index) => (index < 12 ? 50 : 75),
    result: '1-0',
    termination: 'resignation',
    botEngine: 'maia',
    reviewVersion: 2,
    createdAt,
    endedAt: createdAt,
  });
  return { ...g, white: { name: 'You', isBot: false }, black: { name: 'Maia 1100', isBot: true, elo: 1100, engine: 'maia' } };
}

/** The profile's e2e set: 22 hanging-knight games against a Stockfish level and `maia` conversion wins against Maia. */
export function profileGames(maia = 10): GameRecord[] {
  return [...hangingGames(22), ...Array.from({ length: maia }, (_, i) => maiaConversionGame(i)).reverse()];
}
