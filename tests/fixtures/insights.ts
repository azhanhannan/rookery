// Fixtures for Insights: real reviewed games (chess.js-checked) for facts, and synthetic facts for aggregates.
import { Chess } from 'chess.js';
import type { Score } from '../../src/engine/types';
import type { GameRecord, GameResult } from '../../src/game/types';
import { INSIGHTS } from '../../src/config/tunables';
import type { GameFacts, Motif, MoveFact, Phase } from '../../src/insights/types';
import type { GameReview, MoveLabel, MoveReview, PositionReview } from '../../src/review/types';

/** Knights out and back: legal for as long as needed, 4 plies a cycle. */
export function shuffleSans(plies: number): string[] {
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  return Array.from({ length: plies }, (_, i) => cycle[i % 4]);
}

export type GameSpec = {
  id?: string;
  sans?: string[];
  startFen?: string;
  /** White's win chance at each position (index 0 = start); default 50 everywhere. */
  wins?: (index: number) => number;
  user?: 'w' | 'b';
  /** 'bot': the other side is a bot; 'human': both people, record.userColor set. */
  opponent?: 'bot' | 'human';
  /** The bot side's engine field (absent = a game saved before Maia: Stockfish). */
  botEngine?: 'maia' | 'stockfish';
  /** Review format version (default 1: no second lines). */
  reviewVersion?: 1 | 2;
  opponentElo?: number;
  result?: GameResult;
  termination?: string;
  timeControl?: string;
  /** Mover's clock after each ply, ms. */
  clocks?: number[];
  depth?: number;
  bookPlies?: number;
  opening?: { eco?: string; name?: string };
  practice?: boolean;
  createdAt?: string;
  endedAt?: string;
  takebacks?: number;
  /** Per position index: engine data. */
  engine?: Record<number, { bestMove?: string; bestLine?: string[]; score?: Score; second?: { move: string; score: Score } }>;
  labels?: Record<number, MoveLabel>;
  reviewed?: boolean;
};

function labelFor(loss: number): MoveLabel {
  if (loss <= 2) return 'Best';
  if (loss <= 5) return 'Good';
  if (loss <= 10) return 'Inaccuracy';
  if (loss <= 20) return 'Mistake';
  return 'Blunder';
}

export function makeGame(spec: GameSpec = {}): GameRecord & { endedAt?: string; takebacks?: number } {
  const sans = spec.sans ?? shuffleSans(24);
  const chess = new Chess(spec.startFen);
  const startFen = chess.fen();
  const moves: GameRecord['moves'] = [];
  for (const [i, san] of sans.entries()) {
    const m = chess.move(san);
    moves.push({ san: m.san, uci: m.lan, fenAfter: m.after, ...(spec.clocks ? { clockMs: spec.clocks[i] } : {}) });
  }
  const win = spec.wins ?? (() => 50);
  const fens = [startFen, ...moves.map((m) => m.fenAfter)];
  const positions: PositionReview[] = fens.map((fen, i) => {
    const e = spec.engine?.[i] ?? {};
    return {
      fen,
      winWhite: win(i),
      bestLine: e.bestLine ?? (e.bestMove ? [e.bestMove] : []),
      ...(e.bestMove ? { bestMove: e.bestMove } : {}),
      ...(e.score ? { score: e.score } : {}),
      ...(e.second ? { second: e.second } : {}),
    };
  });
  const book = spec.bookPlies ?? 0;
  const reviewMoves: MoveReview[] = moves.map((m, i) => {
    const ply = i + 1;
    const color = new Chess(fens[i]).turn();
    const mine = (w: number) => (color === 'w' ? w : 100 - w);
    const winBefore = mine(win(i));
    const winAfter = mine(win(ply));
    const loss = Math.max(0, winBefore - winAfter);
    return {
      ply,
      color,
      san: m.san,
      uci: m.uci,
      label: spec.labels?.[ply] ?? (ply <= book ? 'Book' : labelFor(loss)),
      winBefore,
      winAfter,
      loss,
      accuracy: 100 - loss,
      explanation: '',
    };
  });
  const summary = { accuracy: null, moves: 0, counts: {} as Record<MoveLabel, number> };
  const review: GameReview = {
    version: spec.reviewVersion ?? 1,
    depth: spec.depth ?? 16,
    createdAt: '2026-10-01T00:00:00.000Z',
    positions,
    moves: reviewMoves,
    opening: { bookPlies: book, ...spec.opening },
    white: summary,
    black: summary,
  };
  const user = spec.user ?? 'w';
  const human = spec.opponent === 'human';
  const opp = {
    name: 'Opp',
    isBot: !human,
    ...(spec.opponentElo !== undefined ? { elo: spec.opponentElo } : {}),
    ...(!human && spec.botEngine ? { engine: spec.botEngine } : {}),
  };
  const me = { name: 'Me', isBot: false };
  const record: GameRecord & { endedAt?: string; takebacks?: number } = {
    id: spec.id ?? 'g1',
    startFen,
    moves,
    white: user === 'w' ? me : opp,
    black: user === 'w' ? opp : me,
    result: spec.result ?? '1/2-1/2',
    createdAt: spec.createdAt ?? '2026-10-01T10:00:00.000Z',
  };
  if (spec.reviewed !== false) record.review = review;
  if (human) record.userColor = user;
  if (spec.termination) record.termination = spec.termination;
  if (spec.timeControl) record.timeControl = spec.timeControl;
  if (spec.practice) record.practice = true;
  if (spec.endedAt) record.endedAt = spec.endedAt;
  if (spec.takebacks !== undefined) record.takebacks = spec.takebacks;
  return record;
}

// ---- Synthetic facts for aggregate and Focus tests ----

export type FakeMove = Partial<MoveFact> & { phase?: Phase; loss?: number; motif?: Exclude<Motif, 'other'> };

/** A day offset from 1 Oct 2026, as ISO. */
export const day = (n: number, hour = 12) => new Date(Date.UTC(2026, 9, 1 + n, hour)).toISOString();

export type FakeGame = {
  id: string;
  at?: string;
  score?: number;
  opponent?: GameFacts['opponent'];
  opponentElo?: number;
  speed?: GameFacts['speed'];
  color?: 'w' | 'b';
  opening?: string;
  /** Interesting moves; padded with quiet ones (loss 0, win 50) up to `quiet` per phase. */
  moves?: FakeMove[];
  quiet?: Partial<Record<Phase, number>>;
  extra?: Partial<GameFacts>;
};

export function fakeFacts(g: FakeGame): GameFacts {
  const quiet = { O: 8, M: 16, E: 6, ...g.quiet };
  const moves: MoveFact[] = [];
  let ply = 1;
  const push = (m: FakeMove) => {
    moves.push({
      ply,
      phase: m.phase ?? 'M',
      winBefore: m.winBefore ?? 50,
      winAfter: m.winAfter ?? (m.winBefore ?? 50) - (m.loss ?? 0),
      loss: m.loss ?? 0,
      label: m.label ?? labelFor(m.loss ?? 0),
      inBook: m.inBook ?? false,
      oppThreat: m.oppThreat ?? false,
      ...(m.motif ? { motif: m.motif } : {}),
      ...(m.timeTrouble !== undefined ? { timeTrouble: m.timeTrouble } : {}),
      ...(m.clockMs !== undefined ? { clockMs: m.clockMs } : {}),
      ...(m.spentMs !== undefined ? { spentMs: m.spentMs } : {}),
      ...(m.critical !== undefined ? { critical: m.critical } : {}),
      ...(m.forcing !== undefined ? { forcing: m.forcing } : {}),
    });
    ply += 2;
  };
  for (const phase of ['O', 'M', 'E'] as Phase[]) {
    for (let i = 0; i < quiet[phase]; i++) push({ phase });
    for (const m of g.moves ?? []) if ((m.phase ?? 'M') === phase) push(m);
  }
  const score = g.score ?? 0.5;
  return {
    factsVersion: INSIGHTS.factsVersion,
    gameId: g.id,
    playedAt: g.at ?? day(0),
    createdAt: g.at ?? day(0),
    color: g.color ?? 'w',
    opponent: g.opponent ?? 'stockfish',
    opponentName: 'Opp',
    ...(g.opponentElo !== undefined ? { opponentElo: g.opponentElo } : {}),
    speed: g.speed ?? 'rapid',
    result: score === 1 ? '1-0' : score === 0 ? '0-1' : '1/2-1/2',
    score,
    reviewDepth: 16,
    bookPlies: 0,
    ...(g.opening ? { opening: g.opening } : {}),
    finalWin: score * 100,
    clockOnly: false,
    lostOnTimeWhileBetter: false,
    hasClock: moves.some((m) => m.clockMs !== undefined || m.timeTrouble !== undefined),
    moves,
    notable: [],
    ...g.extra,
  };
}
