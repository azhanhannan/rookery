import { describe, expect, it } from 'vitest';
import { INSIGHTS } from '../../src/config/tunables';
import { myColor } from '../../src/game/myColor';
import { buildAllFacts, buildGameFacts, criticalAt, exclusionReason, historyOf, isForcing, opponentTypeOf, phasesOf } from '../../src/insights/facts';
import {
  allowedBackRankMate,
  gaveAwayStalemate,
  ignoredThreat,
  isBackRankMate,
  motifFor,
  newThreat,
} from '../../src/insights/motifs';
import { captionFact } from '../../src/review/captions';
import { hangingGame } from '../fixtures/insightsGames';
import { makeGame, shuffleSans } from '../fixtures/insights';

describe('myColor', () => {
  it('bot games, imports, explicit side, and two people', () => {
    expect(myColor(makeGame({ user: 'b' }))).toBe('b');
    expect(myColor(makeGame({ user: 'w', opponent: 'human' }))).toBe('w');
    const twoPeople = { ...makeGame({ opponent: 'human' }), userColor: undefined };
    expect(myColor(twoPeople)).toBeNull();
    expect(myColor(twoPeople, 'b')).toBe('b');
  });
});

describe('insights facts: exclusions', () => {
  it('each hygiene rule, in order', () => {
    expect(exclusionReason(makeGame())).toBeNull();
    expect(exclusionReason({ ...makeGame({ opponent: 'human' }), userColor: undefined })).toBe('no-side');
    expect(exclusionReason(makeGame({ result: '*' }))).toBe('unfinished');
    expect(exclusionReason(makeGame({ practice: true }))).toBe('practice');
    expect(exclusionReason(makeGame({ takebacks: 2 }))).toBe('practice');
    expect(exclusionReason(makeGame({ reviewed: false }))).toBe('unreviewed');
    expect(exclusionReason(makeGame({ depth: 12 }))).toBe('shallow-review');
    expect(exclusionReason(makeGame({ sans: shuffleSans(18) }))).toBe('too-short');
    expect(buildGameFacts(makeGame({ depth: 12 }))).toBeNull();
  });

  it('coverage counts what was left out', () => {
    const { facts, coverage } = buildAllFacts([makeGame({ id: 'a' }), makeGame({ id: 'b', depth: 12 }), makeGame({ id: 'c', result: '*' })]);
    expect(facts.map((f) => f.gameId)).toEqual(['a']);
    expect(coverage).toEqual({ total: 3, included: 1, excluded: { 'shallow-review': 1, unfinished: 1 } });
  });
});

describe('insights facts: one game', () => {
  it('basic fields, own moves only, endedAt from the newer record field', () => {
    const f = buildGameFacts(
      makeGame({ user: 'b', result: '0-1', opponentElo: 1200, endedAt: '2026-10-01T10:20:00.000Z', opening: { eco: 'A04', name: 'Zukertort Opening' }, bookPlies: 2 }),
    )!;
    expect(f.color).toBe('b');
    expect(f.score).toBe(1);
    expect(f.opponent).toBe('stockfish');
    expect(f.opponentElo).toBe(1200);
    expect(f.playedAt).toBe('2026-10-01T10:20:00.000Z');
    expect(f.speed).toBe('untimed');
    expect(f.factsVersion).toBe(INSIGHTS.factsVersion);
    expect(f.moves.every((m) => m.ply % 2 === 0)).toBe(true);
    expect(f.moves).toHaveLength(12);
    expect(f.moves[0].inBook).toBe(true);
    expect(f.moves[1].inBook).toBe(false);
    expect(f.opening).toBe('Zukertort Opening');
  });

  it("coach's case: a won game thrown away in one move (95 -> 40) is a real, counted error", () => {
    // White wins 95% until ply 20, then White's move 21 drops it to 40.
    const f = buildGameFacts(makeGame({ wins: (i) => (i <= 20 ? 95 : 40) }))!;
    const m = f.moves.find((x) => x.ply === 21)!;
    expect(m.winBefore).toBe(95);
    expect(m.winAfter).toBe(40);
    expect(m.loss).toBe(55);
    expect(m.label).toBe('Blunder');
    expect(f.notable[0]).toMatchObject({ ply: 21, loss: 55, motif: 'other' });
    // The conversion episode started (two own moves at +2 after ply 10) and was not converted.
    expect(f.conversion).toEqual({ startPly: 11, win: 95 });
    expect(f.score).toBe(0.5);
  });

  it('save episodes mirror conversion', () => {
    const f = buildGameFacts(makeGame({ wins: (i) => (i >= 12 ? 20 : 50) }))!;
    expect(f.save?.startPly).toBe(13);
    expect(f.conversion).toBeUndefined();
  });

  it('clock: time spent and time trouble from the clock before the move', () => {
    // 60+1: White's clock after each own move: 50 s, 35 s, 20 s, 10 s, ...; Black's always 55 s.
    const own = [50_000, 35_000, 20_000, 10_000, 9_000, 8_000, 7_000, 6_000, 5_000, 4_000, 3_000, 2_000];
    const clocks = shuffleSans(24).map((_, i) => (i % 2 === 0 ? own[i / 2] : 55_000));
    const f = buildGameFacts(makeGame({ timeControl: '60+1', clocks }))!;
    expect(f.speed).toBe('bullet');
    expect(f.hasClock).toBe(true);
    expect(f.moves[0]).toMatchObject({ clockMs: 50_000, spentMs: 11_000, timeTrouble: false });
    expect(f.moves[1]).toMatchObject({ spentMs: 16_000, timeTrouble: false });
    // Clock before move 3 is 35 s: above max(30 s, 6 s). Before move 4 it is 20 s: trouble.
    expect(f.moves[2].timeTrouble).toBe(false);
    expect(f.moves[3].timeTrouble).toBe(true);
  });

  it('untimed games carry no clock fields', () => {
    const f = buildGameFacts(makeGame())!;
    expect(f.hasClock).toBe(false);
    expect(f.moves[0].timeTrouble).toBeUndefined();
  });

  it('lost on time while better: a clock event, kept out of chess metrics', () => {
    const f = buildGameFacts(makeGame({ result: '0-1', termination: 'timeout', wins: () => 70 }))!;
    expect(f.clockOnly).toBe(true);
    expect(f.lostOnTimeWhileBetter).toBe(true);
    const lichess = buildGameFacts(makeGame({ result: '0-1', termination: 'Time forfeit', wins: () => 45 }))!;
    expect(lichess.clockOnly).toBe(true);
    expect(lichess.lostOnTimeWhileBetter).toBe(false);
    // Worse when the flag fell: an ordinary loss.
    const worse = buildGameFacts(makeGame({ result: '0-1', termination: 'timeout', wins: () => 20 }))!;
    expect(worse.clockOnly).toBe(false);
    const abandoned = buildGameFacts(makeGame({ result: '0-1', termination: 'Abandoned', wins: () => 80 }))!;
    expect(abandoned.clockOnly).toBe(true);
    expect(abandoned.lostOnTimeWhileBetter).toBe(false);
  });

  it('a proven caption becomes the move motif (allowed mate on the back rank)', () => {
    // 1.a3?? Re1# style: White plays Ra2 and allows Re1#. Build it as a game from that position.
    const startFen = '4r1k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
    const sans = ['Ra2', 'Kh8', 'Ra1', 'Kg8', 'Ra2', 'Kh8', 'Ra1', 'Kg8', 'Ra2', 'Kh8', 'Ra1', 'Kg8', 'Ra2', 'Kh8', 'Ra1', 'Kg8', 'Ra2', 'Kh8', 'Ra1', 'Kg8', 'Ra2'];
    const f = buildGameFacts(
      makeGame({ startFen, sans, result: '0-1', wins: (i) => (i <= 20 ? 50 : 0), engine: { 21: { bestMove: 'e8e1', bestLine: ['e8e1'], score: { mate: -1 } } } }),
    )!;
    const last = f.moves.find((m) => m.ply === 21)!;
    expect(last.caption).toBe('allowed-mate-1');
    expect(last.motif).toBe('back-rank');
  });
});

describe('insights facts: phases', () => {
  it('book plies stay opening; the endgame starts on sparse material', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const end = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1';
    expect(phasesOf([start, start, start, start], 2)).toEqual(['O', 'O', 'O']);
    expect(phasesOf([start, end, end], 0)).toEqual(['O', 'E']);
  });

  it('the middlegame starts by ply 30 at the latest', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const p = phasesOf(Array(41).fill(start), 0);
    expect(p[29]).toBe('O');
    expect(p[30]).toBe('M');
  });

  it('a sparse back rank starts the middlegame', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const sparse = 'rnbqkbnr/pppppppp/8/8/8/2NBBNQ1/PPPPPPPP/R3K2R w KQkq - 0 1';
    expect(phasesOf([start, sparse, sparse], 0)).toEqual(['O', 'M']);
  });
});

describe('insights motifs', () => {
  it('ignored threat: the pawn attacked the knight and the move left it there', () => {
    const fenPrev = '6k1/8/3p4/8/4N3/8/6PP/6K1 b - - 0 1';
    const fenBefore = '6k1/8/8/3p4/4N3/8/6PP/6K1 w - - 0 2';
    const threat = newThreat(fenPrev, fenBefore, 'w');
    expect(threat).toEqual({ hanging: ['e4'], mate: false });
    const fact = captionFact({ label: 'Blunder', fenBefore, uci: 'h2h3', bestAfter: 'd5e4' });
    expect(fact?.kind).toBe('left-undefended');
    expect(ignoredThreat(fact, threat, fenBefore, 'w')).toBe(true);
    const fenAfter = '6k1/8/8/3p4/4N3/7P/6P1/6K1 b - - 0 2';
    expect(motifFor({ fact, fenBefore, fenAfter, me: 'w', winBefore: 50, loss: 30, threat })).toBe('ignored-threat');
    // Too small a loss to call it: falls back to the caption's motif.
    expect(motifFor({ fact, fenBefore, fenAfter, me: 'w', winBefore: 50, loss: 6, threat })).toBe('hanging');
    // No new threat (the knight was already attacked before their move): just a hanging piece.
    expect(newThreat(fenBefore.replace(' w ', ' b '), fenBefore, 'w')).toBeNull();
  });

  it('ignored threat: a different piece lost is not the threat ignored', () => {
    const fenBefore = '6k1/8/8/3p4/4N3/8/6PP/6K1 w - - 0 2';
    const threat = { hanging: ['e4' as const], mate: false };
    expect(ignoredThreat({ kind: 'left-undefended', piece: 'n', square: 'c4', san: 'dxc4' }, threat, fenBefore, 'w')).toBe(false);
    expect(ignoredThreat(null, threat, fenBefore, 'w')).toBe(false);
  });

  it('a new mate-in-1 threat ignored; it lands on the back rank, which wins the tag', () => {
    const fenPrev = '6k1/r4ppp/8/8/8/8/5PPP/1N4K1 b - - 0 1';
    const fenBefore = '6k1/4rppp/8/8/8/8/5PPP/1N4K1 w - - 1 2';
    const threat = newThreat(fenPrev, fenBefore, 'w');
    expect(threat?.mate).toBe(true);
    const fact = captionFact({ label: 'Blunder', fenBefore, uci: 'b1c3', bestAfter: 'e7e1' });
    expect(fact).toEqual({ kind: 'allowed-mate-1', san: 'Re1#', uci: 'e7e1' });
    expect(ignoredThreat(fact, threat, fenBefore, 'w')).toBe(true);
    const fenAfter = '6k1/4rppp/8/8/8/2N5/5PPP/6K1 b - - 2 2';
    expect(motifFor({ fact, fenBefore, fenAfter, me: 'w', winBefore: 50, loss: 50, threat })).toBe('back-rank');
  });

  it('back-rank mate: king on its home rank behind its own pieces, mated along the rank', () => {
    expect(isBackRankMate('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1')).toBe(true);
    // Mate, but not on the back rank (the king is in the middle of the board).
    expect(isBackRankMate('8/8/8/8/8/5k2/8/5K1q w - - 0 1')).toBe(false);
    // Not mate at all.
    expect(isBackRankMate('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1')).toBe(false);
    // A queen mate on g7 (not along the rank) is not a back-rank mate.
    expect(isBackRankMate('6k1/5pQp/6pB/8/8/8/8/6K1 b - - 0 1')).toBe(false);
  });

  it('allowed mate in 2 that ends on the back rank uses the engine line', () => {
    const fact = { kind: 'allowed-mate-2' } as const;
    // The line ends in mate on the first rank, but nothing of White's stands in front of the king.
    expect(allowedBackRankMate(fact, '1r4k1/r7/8/8/2P5/8/8/7K b - - 0 1', ['a7a2', 'h1g1', 'b8b1'])).toBe(false);
    // A line that doesn't end in mate proves nothing.
    expect(allowedBackRankMate(fact, '1r4k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1', ['g1f1'])).toBe(false);
    // In 1 (replayed from the fact): the classic.
    expect(allowedBackRankMate({ kind: 'allowed-mate-1', san: 'Re1#', uci: 'e8e1' }, '4r1k1/5ppp/8/8/8/8/R4PPP/6K1 b - - 1 1')).toBe(true);
  });

  it('stalemate given away from a winning position', () => {
    const fenAfter = '7k/5K2/6Q1/8/8/8/8/8 b - - 1 1';
    expect(gaveAwayStalemate(fenAfter, 100)).toBe(true);
    expect(gaveAwayStalemate(fenAfter, 60)).toBe(false);
    expect(motifFor({ fact: null, fenBefore: '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1', fenAfter, me: 'w', winBefore: 100, loss: 50, threat: null })).toBe(
      'stalemate',
    );
  });
});

describe('insights facts: history', () => {
  it('orders finished games with a side by end (or start) time', () => {
    const h = historyOf([
      makeGame({ id: 'b', createdAt: '2026-10-02T00:00:00.000Z', result: '1-0' }),
      makeGame({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z', result: '0-1' }),
      makeGame({ id: 'x', result: '*' }),
    ]);
    expect(h).toEqual([
      { gameId: 'a', playedAt: '2026-10-01T00:00:00.000Z', score: 0 },
      { gameId: 'b', playedAt: '2026-10-02T00:00:00.000Z', score: 1 },
    ]);
  });
});

describe('insights facts: opponent type (factsVersion 2)', () => {
  it('person, Maia bot, Stockfish level; a bot with no engine field is Stockfish', () => {
    expect(buildGameFacts(makeGame({ opponent: 'human' }))!.opponent).toBe('human');
    expect(buildGameFacts(makeGame({ botEngine: 'maia' }))!.opponent).toBe('maia');
    expect(buildGameFacts(makeGame({ botEngine: 'stockfish' }))!.opponent).toBe('stockfish');
    expect(buildGameFacts(makeGame())!.opponent).toBe('stockfish');
    expect(opponentTypeOf({ name: 'x', isBot: false, engine: 'maia' })).toBe('human');
  });
});

describe('insights facts: critical moves from the second line', () => {
  // White to move at even position indices; ply 3 (White) is played from position 2.
  const engine = {
    // Only one move holds: best +3.00, second -1.00 (a big win-chance gap).
    2: { bestMove: 'g1f3', score: { cp: 300 }, second: { move: 'b1c3', score: { cp: -100 } } },
    // Two moves about as good.
    4: { bestMove: 'f3g1', score: { cp: 20 }, second: { move: 'b1c3', score: { cp: 10 } } },
    // Version 2 and no second line: only one legal move.
    6: { bestMove: 'g1f3', score: { cp: 20 } },
  };

  it('version 2: critical when the best line beats the second by REVIEW.greatGap; one legal move is not critical', () => {
    const f = buildGameFacts(makeGame({ reviewVersion: 2, engine }))!;
    expect(f.moves.find((m) => m.ply === 3)!.critical).toBe(true);
    expect(f.moves.find((m) => m.ply === 5)!.critical).toBe(false);
    expect(f.moves.find((m) => m.ply === 7)!.critical).toBe(false);
  });

  it('version 1 reviews load, and a missing second line is not read as "only one legal move"', () => {
    const f = buildGameFacts(makeGame({ reviewVersion: 1, engine }))!;
    expect(f).not.toBeNull();
    expect(f.moves.every((m) => m.critical === undefined)).toBe(true);
    const v1 = makeGame({ engine }).review!;
    expect(criticalAt(v1, v1.positions[6], 'w')).toBeUndefined();
  });

  it('from the mover’s side: the same gap counts for Black', () => {
    const g = makeGame({ reviewVersion: 2, user: 'b', engine: { 3: { bestMove: 'g8f6', score: { cp: -300 }, second: { move: 'b8c6', score: { cp: 100 } } } } });
    expect(buildGameFacts(g)!.moves.find((m) => m.ply === 4)!.critical).toBe(true);
  });
});

describe('insights facts: forcing moves (factsVersion 3, cost by type)', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('captures and checks are forcing; a quiet developing move is not; an illegal move is unknown', () => {
    expect(isForcing('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'e4d5')).toBe(true);
    expect(isForcing('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8')).toBe(true);
    expect(isForcing(START, 'e2e4')).toBe(false);
    expect(isForcing(START, 'e2e5')).toBeUndefined();
  });

  it('a sacrifice that creates a threat is forcing: the rook goes en prise and threatens mate on the back rank', () => {
    // Re5: dxe5 wins the rook, but Re8# is threatened.
    expect(isForcing('6k1/5ppp/p2p4/R7/8/8/5PPP/6K1 w - - 0 1', 'a5e5')).toBe(true);
    // The same rook move with the e-file shut by a defended pawn on e6: material given away, no threat. Not forcing.
    expect(isForcing('6k1/5ppp/p2pp3/R7/8/8/5PPP/6K1 w - - 0 1', 'a5e5')).toBe(false);
  });

  it('a piece simply left hanging is a blunder, not a sacrifice: 3.Nh4?? is quiet', () => {
    const f = buildGameFacts(hangingGame(0))!;
    expect(f.factsVersion).toBe(INSIGHTS.factsVersion);
    expect(f.moves.find((m) => m.ply === 5)).toMatchObject({ forcing: false, motif: 'hanging' });
    expect(f.moves.every((m) => typeof m.forcing === 'boolean')).toBe(true);
  });

  it('every own move carries the flag, from Black’s side too', () => {
    // 1.e4 d5 2.exd5 Qxd5: Black's recapture is forcing.
    const g = makeGame({ user: 'b', sans: ['e4', 'd5', 'exd5', 'Qxd5', ...shuffleSans(20)] });
    const f = buildGameFacts(g)!;
    expect(f.moves.find((m) => m.ply === 2)!.forcing).toBe(false);
    expect(f.moves.find((m) => m.ply === 4)!.forcing).toBe(true);
  });
});
