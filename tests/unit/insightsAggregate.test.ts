import { describe, expect, it } from 'vitest';
import { INSIGHTS } from '../../src/config/tunables';
import {
  afterLossLine,
  buildInsights,
  buildLedger,
  clockCard,
  openingRows,
  phaseRates,
  trendFor,
} from '../../src/insights/aggregate';
import { buildGameFacts } from '../../src/insights/facts';
import type { GameFacts } from '../../src/insights/types';
import { day, fakeFacts, makeGame, type FakeGame } from '../fixtures/insights';

const many = (n: number, f: (i: number) => Omit<FakeGame, 'id'>) => Array.from({ length: n }, (_, i) => fakeFacts({ id: `g${i}`, at: day(i), ...f(i) }));

/** 25 games: one middlegame hanging piece (30) each, one unexplained middlegame loss (40), a fork every 5th game. */
function typicalPlayer(n = 25): GameFacts[] {
  return many(n, (i) => ({
    moves: [
      { phase: 'M', loss: 30, motif: 'hanging' },
      { phase: 'M', loss: 40 },
      ...(i % 5 === 0 ? [{ phase: 'M' as const, loss: 25, motif: 'fork' as const }] : []),
    ],
  }));
}

describe('insights: page gates', () => {
  it('locked below 10 games, early read below 20, then ready', () => {
    expect(buildInsights(typicalPlayer(9), { style: 'analyst' })).toMatchObject({ status: 'locked', needGames: 1, focus: null, cards: [] });
    expect(buildInsights(typicalPlayer(12), { style: 'analyst' }).status).toBe('early');
    expect(buildInsights(typicalPlayer(20), { style: 'analyst' }).status).toBe('ready');
  });

  it('filters by speed and opponent before anything is counted', () => {
    const facts = [...many(12, () => ({ speed: 'blitz' })), ...many(3, () => ({ speed: 'rapid', opponent: 'human' }))].map((f, i) => ({ ...f, gameId: `x${i}` }));
    expect(buildInsights(facts, { style: 'club', speed: 'blitz' }).games).toBe(12);
    expect(buildInsights(facts, { style: 'club', opponent: 'human' }).games).toBe(3);
    expect(buildInsights(facts, { style: 'club' }).filters).toEqual({ speed: 'all', opponent: 'all' });
  });

  it('opponent filter: people, Maia bots, Stockfish levels, or both kinds of bot', () => {
    const facts = [
      ...many(4, () => ({ opponent: 'human' })),
      ...many(5, () => ({ opponent: 'maia' })),
      ...many(6, () => ({ opponent: 'stockfish' })),
    ].map((f, i) => ({ ...f, gameId: `o${i}` }));
    expect(buildInsights(facts, { style: 'club', opponent: 'human' }).games).toBe(4);
    expect(buildInsights(facts, { style: 'club', opponent: 'maia' }).games).toBe(5);
    expect(buildInsights(facts, { style: 'club', opponent: 'stockfish' }).games).toBe(6);
    expect(buildInsights(facts, { style: 'club', opponent: 'bot' }).games).toBe(11);
    expect(buildInsights(facts, { style: 'club', opponent: 'all' }).games).toBe(15);
  });

  it('facts from an older version are ignored (rebuilt, never mixed)', () => {
    const facts = typicalPlayer(12).map((f) => ({ ...f, factsVersion: INSIGHTS.factsVersion - 1 }));
    expect(buildInsights(facts, { style: 'club' }).games).toBe(0);
  });
});

describe('insights: points-lost ledger', () => {
  it('cells add up to the total; "other" is reported and ranked, but is never the Focus', () => {
    const facts = typicalPlayer();
    const ledger = buildLedger(facts);
    expect(ledger.games).toBe(25);
    expect(ledger.pointsPerGame).toBeCloseTo(0.3 + 0.4 + 0.25 / 5, 10);
    expect(ledger.otherShare).toBeCloseTo(0.4 / 0.75, 10);
    expect(ledger.cells[0].id).toBe('M:other');
    const model = buildInsights(facts, { style: 'analyst' });
    expect(model.focus?.id).toBe('M:hanging');
    expect(model.focus).toMatchObject({ eligible: true, testable: true, shown: true, games: 25, events: 25 });
    expect(model.focus?.train).toEqual({ kind: 'mistakes', href: '#/puzzles', motif: 'hanging' });
  });

  it('shrinkage + lower-bound ranking: a big but thin bucket does not outrank a solid one', () => {
    // 25 games with a steady 0.2-point fork; 2 games with a 0.9-point missed mate.
    const facts = many(25, (i) => ({
      moves: [{ phase: 'M', loss: 20, motif: 'fork' }, ...(i < 2 ? [{ phase: 'E' as const, loss: 90, motif: 'missed-mate' as const }] : [])],
    }));
    const ledger = buildLedger(facts);
    const fork = ledger.cells.find((c) => c.id === 'M:fork')!;
    const mate = ledger.cells.find((c) => c.id === 'E:missed-mate')!;
    expect(fork.lowerBound).toBeGreaterThan(mate.lowerBound);
    // Shrunk toward the average cell: well below the raw 0.072/game for the two-game bucket.
    expect(mate.pointsPerGame.value).toBeLessThan(mate.rawPointsPerGame);
    expect(mate.shown).toBe(false);
    expect(ledger.cells.indexOf(fork)).toBeLessThan(ledger.cells.indexOf(mate));
  });

  it('Focus needs 20 games, 8 events and testability', () => {
    expect(buildInsights(typicalPlayer(19), { style: 'learner' }).focus).toBeNull();
    // Rare motif: 8 events over 40 games is about 3 expected in the next 15 — not testable.
    const rare = many(40, (i) => ({ moves: i % 5 === 0 ? [{ phase: 'M', loss: 30, motif: 'fork' }] : [] }));
    const fork = buildLedger(rare).cells.find((c) => c.id === 'M:fork')!;
    expect(fork.events).toBe(8);
    expect(fork.shown).toBe(true);
    expect(fork.testable).toBe(false);
    expect(fork.eligible).toBe(false);
  });

  it('cards by Review style: Learner = Focus, Club = Focus + watch, Analyst = top 3', () => {
    const facts = many(25, () => ({
      moves: [
        { phase: 'M', loss: 30, motif: 'hanging' },
        { phase: 'M', loss: 20, motif: 'fork' },
        { phase: 'E', loss: 15, motif: 'missed-free-piece' },
        { phase: 'M', loss: 40 },
      ],
    }));
    const learner = buildInsights(facts, { style: 'learner' }).cards;
    expect(learner.map((c) => [c.role, c.bucket.id])).toEqual([['focus', 'M:hanging']]);
    const club = buildInsights(facts, { style: 'club' }).cards;
    expect(club.map((c) => c.role)).toEqual(['focus', 'watch']);
    const analyst = buildInsights(facts, { style: 'analyst' }).cards;
    expect(analyst.map((c) => c.bucket.id)).toEqual(['M:hanging', 'M:fork', 'E:missed-free-piece']);
    expect(analyst.every((c) => c.bucket.motif !== 'other')).toBe(true);
  });

  it('evidence: the bucket’s worst moves, with the position when the game kept it', () => {
    const facts = typicalPlayer(3);
    facts[1].moves.find((m) => m.motif === 'hanging')!.loss = 60;
    facts[1].notable = [{ ply: facts[1].moves.find((m) => m.motif === 'hanging')!.ply, phase: 'M', fenBefore: 'FEN', san: 'x', uci: 'a1a2', loss: 60, motif: 'hanging' }];
    const cell = buildLedger(facts).cells.find((c) => c.id === 'M:hanging')!;
    expect(cell.evidence[0]).toMatchObject({ gameId: 'g1', loss: 60, fenBefore: 'FEN' });
    expect(cell.evidence).toHaveLength(3);
  });
});

describe("insights: the coach's thrown-away win is counted", () => {
  it('a 95% -> 40% move lands in the ledger and in the phase error rate', () => {
    const real = buildGameFacts(makeGame({ wins: (i) => (i <= 20 ? 95 : 40) }))!;
    const ledger = buildLedger([real]);
    expect(ledger.pointsPerGame).toBeCloseTo(0.55, 10);
    const rates = phaseRates([real]);
    const phase = real.moves.find((m) => m.ply === 21)!.phase;
    expect(rates.find((r) => r.phase === phase)!.errors).toBe(1);
    // The conversion overlay sees it too.
    const conversion = ledger.overlays.find((o) => o.id === 'conversion')!;
    expect(conversion.rawPointsPerGame).toBeCloseTo(0.55, 10);
    expect(conversion.events).toBe(1);
  });

  it('only already-lost positions (win before < 10) are left out of error rates', () => {
    const facts = [fakeFacts({ id: 'a', moves: [{ phase: 'M', winBefore: 5, loss: 5 }, { phase: 'M', winBefore: 12, loss: 12, winAfter: 0 }] })];
    const m = phaseRates(facts).find((r) => r.phase === 'M')!;
    expect(m.moves).toBe(17); // 16 quiet + the 12% one
    expect(m.slips).toBe(1);
    expect(buildLedger(facts).pointsPerGame).toBeCloseTo(0.17, 10);
  });
});

describe('insights: phase error rates', () => {
  it('per 100 moves with an exact Poisson interval; weakest only when the interval clears the pooled rate', () => {
    const facts = many(20, () => ({ moves: [{ phase: 'E', loss: 25 }, { phase: 'E', loss: 30 }] }));
    const rates = phaseRates(facts);
    const e = rates.find((r) => r.phase === 'E')!;
    expect(e.moves).toBe(160);
    expect(e.errors).toBe(40);
    expect(e.rate.value).toBeCloseTo(25, 10);
    expect(e.weakest).toBe(true);
    expect(e.train.href).toBe('#/endgames');
    expect(rates.find((r) => r.phase === 'M')!.shown).toBe(false);
  });
});

describe('insights: conversion and saves', () => {
  it('Wilson score by opponent type, shown from 8 episodes', () => {
    const facts = many(12, (i) => ({
      score: i < 6 ? 1 : i < 9 ? 0.5 : 0,
      opponent: i % 2 ? 'human' : i % 4 === 0 ? 'maia' : 'stockfish',
      extra: { conversion: { startPly: 21, win: 80 } },
    }));
    const model = buildInsights(facts, { style: 'club' });
    expect(model.conversion.all).toMatchObject({ episodes: 12, won: 6, drawn: 3, lost: 3, shown: true, earlyRead: true });
    expect(model.conversion.all.score.value).toBeCloseTo(7.5 / 12, 10);
    expect(model.conversion.human.episodes).toBe(6);
    expect(model.conversion.maia.episodes).toBe(3);
    expect(model.conversion.stockfish.episodes).toBe(3);
    // People and Maia pooled; Stockfish levels never.
    expect(model.conversion.humanLike.episodes).toBe(9);
    expect(model.conversion.humanLike.gameIds).not.toContain(facts[2].gameId);
    expect(model.conversion.human.shown).toBe(false);
    expect(model.saves.all.episodes).toBe(0);
  });
});

describe('insights: clock card', () => {
  it('error-rate ratio in time trouble, and losses on time while better', () => {
    const facts = many(10, (i) => ({
      moves: [
        ...Array.from({ length: 5 }, (_, j) => ({ phase: 'E' as const, timeTrouble: true, loss: j < 2 ? 25 : 0 })),
        ...Array.from({ length: 10 }, (_, j) => ({ phase: 'M' as const, timeTrouble: false, loss: j === 0 && i % 3 === 0 ? 25 : 0 })),
      ],
    }));
    facts[0] = { ...facts[0], clockOnly: true, lostOnTimeWhileBetter: true, finalWin: 70 };
    const clock = clockCard(facts)!;
    expect(clock.troubleMoves).toBe(45);
    expect(clock.troubleErrors).toBe(18);
    expect(clock.shown).toBe(true);
    expect(clock.normalMoves).toBe(90);
    expect(clock.normalErrors).toBe(3);
    expect(clock.ratio.value).toBeCloseTo((18 / 45) / (3 / 90), 10);
    expect(clock.differs).toBe(true);
    expect(clock.lostOnTimeWhileBetter).toEqual(['g0']);
    expect(clock.rushedCritical).toBeNull();
    // The flag loss counts in the time-trouble overlay as 0.7 points.
    const overlay = buildLedger(facts).overlays.find((o) => o.id === 'time-trouble')!;
    expect(overlay.games).toBe(10);
    expect(overlay.rawPointsPerGame).toBeCloseTo((0.7 + 9 * 0.5) / 10, 10);
    expect(overlay.train).toBeUndefined();
    expect(overlay.eligible).toBe(false);
    expect(clockCard(many(3, () => ({})))).toBeNull();
  });
});

describe('insights: after-loss line', () => {
  const alternating = (afterLoss: number, other: number) =>
    many(40, (i) => ({ score: i % 2 === 0 ? 0 : 1, moves: [{ phase: 'M', loss: i % 2 === 1 ? afterLoss + (i % 3) : other + (i % 3) }] }));

  it('shown only with enough games after a loss and a difference whose interval excludes 0', () => {
    const line = afterLossLine(alternating(40, 10), { style: 'club' })!;
    expect(line.afterGames).toBe(20);
    expect(line.difference.lo).toBeGreaterThan(0);
    expect(line.text).toMatch(/^In the game right after a loss, you gave away 0\.\d\d points/);
    expect(line.text).not.toMatch(/tilt|because/i);
    expect(afterLossLine(alternating(10, 10), { style: 'club' })).toBeNull();
    expect(afterLossLine(alternating(40, 10), { style: 'learner' })).toBeNull();
    expect(afterLossLine(alternating(40, 10).slice(0, 20), { style: 'club' })).toBeNull();
  });

  it('uses the full history when given, so unreviewed losses count', () => {
    const facts = many(32, (i) => ({ score: 1, moves: [{ phase: 'M', loss: i % 2 ? 40 + (i % 3) : 10 + (i % 3) }] }));
    expect(afterLossLine(facts, { style: 'analyst' })).toBeNull();
    // An unreviewed loss before every odd game.
    const history = facts.flatMap((f, i) => [
      ...(i % 2 ? [{ gameId: `lost${i}`, playedAt: day(i, 6), score: 0 }] : []),
      { gameId: f.gameId, playedAt: f.playedAt, score: f.score },
    ]);
    expect(afterLossLine(facts, { style: 'analyst', history })?.afterGames).toBe(16);
  });
});

describe('insights: openings and trend', () => {
  it('opening rows: shrunk score, early read below 30, shown from 10', () => {
    const facts = many(12, (i) => ({ opening: 'Sicilian Defense: Najdorf Variation', color: 'b', score: i < 9 ? 1 : 0, opponent: 'human', opponentElo: 1500 }));
    const [row] = openingRows(facts);
    expect(row).toMatchObject({ name: 'Sicilian Defense', color: 'b', games: 12, won: 9, shown: true, earlyRead: true });
    expect(row.shrunkScore).toBeCloseTo(0.75, 10);
    expect(row.performance).toBe(Math.round(1500 + 400 * Math.log10(0.75 / 0.25)));
    expect(row.train.href).toBe('#/openings');
  });

  it('trend: Bayesian slope over 40+ games; says improving only when the interval excludes 0', () => {
    const better = many(50, (i) => ({ moves: i < 25 ? [{ phase: 'M', loss: 40, motif: 'hanging' }, { phase: 'M', loss: 30, motif: 'hanging' }] : [{ phase: 'M', loss: 10, motif: 'hanging' }] }));
    expect(trendFor(better, 'M:hanging')).toMatchObject({ shown: true, direction: 'improving', games: 50 });
    expect(trendFor(better.slice(0, 30), 'M:hanging')).toMatchObject({ shown: false, direction: 'no-clear-change' });
    const flat = many(50, (i) => ({ moves: [{ phase: 'M', loss: 20 + (i % 3) * 5, motif: 'hanging' }] }));
    expect(trendFor(flat, 'M:hanging').direction).toBe('no-clear-change');
  });
});
