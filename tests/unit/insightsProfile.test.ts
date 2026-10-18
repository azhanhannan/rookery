// "Your recent games" (src/insights/profile.ts): gates, states, the opponent rule, Focus matching, what each
// Review style sees, and the wording rules (decision docs/player-profile-2026-10/decision.md, Slice 1).
import { describe, expect, it } from 'vitest';
import { INSIGHTS } from '../../src/config/tunables';
import { buildInsights } from '../../src/insights/aggregate';
import {
  buildProfile,
  clubLines,
  CLOSING_LINE,
  focusLineId,
  learnerView,
  lockedText,
  noFocusText,
  PROFILE_BANNED,
  profileTexts,
  styleText,
  windowText,
  type PlayerProfile,
  type ProfileOptions,
} from '../../src/insights/profile';
import type { GameFacts } from '../../src/insights/types';
import { day, fakeFacts, type FakeGame, type FakeMove } from '../fixtures/insights';

const many = (n: number, f: (i: number) => Omit<FakeGame, 'id'>, prefix = 'g') =>
  Array.from({ length: n }, (_, i) => fakeFacts({ id: `${prefix}${i}`, at: day(i), ...f(i) }));

const profileOf = (facts: GameFacts[], opts: Parameters<typeof buildInsights>[1] = { style: 'analyst' }, focusId?: ProfileOptions['focusId']) =>
  buildProfile(buildInsights(facts, opts), focusId === undefined ? {} : { focusId });

const line = (p: PlayerProfile, id: string) => p.lines.find((l) => l.id === id);
const waiting = (p: PlayerProfile, id: string) => p.waiting.find((l) => l.id === id);

/**
 * 25 games, all one opening: two unexplained middlegame errors a game, an opening error in 8 of them, no endgame
 * errors. So the middlegame clearly leaks, and the opening clearly holds up.
 */
function middlegameLeaker(n = 25, extra: (i: number) => FakeMove[] = () => [], over: (i: number) => Omit<FakeGame, 'id' | 'moves'> = () => ({})) {
  return many(n, (i) => ({
    opening: 'Italian Game',
    moves: [{ phase: 'M', loss: 30 }, { phase: 'M', loss: 30 }, ...(i < 8 ? [{ phase: 'O' as const, loss: 30 }] : []), ...extra(i)],
    ...over(i),
  }));
}

describe('profile: the section gate (20 games)', () => {
  it('below 20 games: locked, no lines, only "n of 20"', () => {
    const p = profileOf(middlegameLeaker(19));
    expect(p).toMatchObject({ status: 'locked', games: 19, needGames: 1, lines: [], waiting: [] });
    expect(lockedText(p)).toBe('This opens at 20 reviewed games: 19 of 20 so far.');
    expect(INSIGHTS.minSample.profileGames).toBe(20);
  });

  it('opens at 20 and always carries the closing line', () => {
    const p = profileOf(middlegameLeaker(20));
    expect(p.status).toBe('open');
    expect(p.closing).toBe(CLOSING_LINE);
    expect(CLOSING_LINE).toBe('This describes your recent games, not you. It updates as you play.');
  });
});

describe('profile: phase and openings', () => {
  const p = profileOf(middlegameLeaker());

  it('the middlegame leaks clearly: a habit line with its count, interval, reference and evidence', () => {
    const m = line(p, 'phase')!;
    expect(m).toMatchObject({ tone: 'habit', state: 'clear', phase: 'M', group: 'all', format: 'per100', games: 25 });
    expect(m.text).toMatch(/^Most of your errors come in the middlegame: \d+\.\d mistakes or worse per 100 moves there \(50 in \d+ moves\), against \d+\.\d across the whole game\.$/);
    expect(m.estimate.lo).toBeGreaterThan(m.reference!);
    expect(m.n).toBe(m.estimate.value > 0 ? m.n : 0);
  });

  it('the opening clearly holds up: a strength line, and the "not the problem" reassurance', () => {
    const o = line(p, 'phase-strength')!;
    expect(o).toMatchObject({ tone: 'strength', state: 'clear', phase: 'O', plain: 'Your opening moves hold up well.' });
    expect(o.estimate.hi).toBeLessThan(o.reference!);
    const r = line(p, 'openings')!;
    expect(r).toMatchObject({ tone: 'reassurance', state: 'clear', plain: 'Your openings are not where you lose points.' });
    expect(r.text).toMatch(/^Your openings are not where you lose points: /);
    expect(r.detail).toBe('Most played: Italian Game as White, 25 games (score 50%).');
  });

  it('an even spread: leaning, with no comparison words', () => {
    const even = profileOf(many(25, (i) => ({ opening: 'Italian Game', moves: [{ phase: 'M', loss: 30 }, ...(i % 2 ? [{ phase: 'O' as const, loss: 30 }] : [])] })));
    const m = line(even, 'phase')!;
    expect(m.state).toBe('leaning');
    expect(m.tone).toBe('neutral');
    expect(m.text).toContain('not clearly more than the rest of the game yet');
    expect(m.text).not.toMatch(/Most of your errors/);
  });

  it('openings below their gate (10 games in one opening) wait with "n of 10"', () => {
    const mixed = profileOf(middlegameLeaker(25, () => [], (i) => ({ opening: `Opening ${i % 4}` })));
    expect(line(mixed, 'openings')).toBeUndefined();
    expect(waiting(mixed, 'openings')!.need).toEqual({ have: 7, of: 10, what: 'games in one opening' });
  });
});

describe('profile: checking their threats', () => {
  it('threats that went through more often than other slips: a clear habit', () => {
    const p = profileOf(middlegameLeaker(25, (i) => [{ oppThreat: true }, { oppThreat: true }, ...(i % 2 ? [{ oppThreat: true, loss: 30, motif: 'ignored-threat' as const }] : [])]));
    const t = line(p, 'threats')!;
    expect(t).toMatchObject({ tone: 'habit', state: 'clear', group: 'all', format: 'share', n: 62 });
    expect(t.text).toMatch(/^After a move of theirs that made a threat, the threat went through 12 times in 62 moves \(19%\)/);
    expect(t.text).toContain('more often than on your other moves (0%)');
    expect(t.evidence).toHaveLength(INSIGHTS.notableMoves);
  });

  it('fewer threats than other slips: a clear strength with a plain line', () => {
    const p = profileOf(
      middlegameLeaker(25, (i) => [
        ...Array.from({ length: 6 }, () => ({ oppThreat: true })),
        ...(i < 8 ? [{ oppThreat: true, loss: 30, motif: 'ignored-threat' as const }] : []),
        ...Array.from({ length: 4 }, () => ({ loss: 30, motif: 'hanging' as const })),
      ]),
    );
    const t = line(p, 'threats')!;
    expect(t).toMatchObject({ tone: 'strength', state: 'clear' });
    expect(t.plain).toBe('You usually answer your opponent’s threats.');
  });

  it('below the card gate (30 moves, 8 events): waiting', () => {
    const p = profileOf(middlegameLeaker(25, (i) => [{ oppThreat: true }, ...(i < 3 ? [{ oppThreat: true, loss: 30, motif: 'ignored-threat' as const }] : [{ oppThreat: true }])]));
    expect(line(p, 'threats')).toBeUndefined();
    expect(waiting(p, 'threats')!.need).toEqual({ have: 3, of: 8, what: 'threats that went through' });
  });
});

describe('profile: converting and saving — people and Maia bots only', () => {
  const conv = (win: number) => ({ conversion: { startPly: 21, win } });

  it('Stockfish-level episodes never count, and are counted in a note', () => {
    const facts = [
      ...middlegameLeaker(20, () => [], (i) => ({ opponent: i % 2 ? 'human' : 'maia', score: 1, extra: conv(70) })),
      ...middlegameLeaker(5, () => [], () => ({ opponent: 'stockfish', score: 0, extra: conv(70) })).map((f, i) => ({ ...f, gameId: `sf${i}` })),
    ];
    const p = profileOf(facts);
    const c = line(p, 'conversion')!;
    expect(c).toMatchObject({ group: 'human-like', n: 20, tone: 'strength', state: 'clear', plain: 'You finish the games you get winning.' });
    expect(c.text).toBe('Against people and Maia bots you converted 20 of 20 clearly winning positions (score 100%). More than what those positions were worth on average (70%).');
    expect(c.reference).toBeCloseTo(0.7, 10);
    expect(c.evidence.every((e) => !e.gameId.startsWith('sf'))).toBe(true);
    expect(c.note).toBe('5 clearly winning positions against Stockfish levels left out: their weaker levels give pieces away at random.');
  });

  it('a Stockfish-only player: converting waits, however many Stockfish episodes there are', () => {
    const p = profileOf(middlegameLeaker(25, () => [], () => ({ opponent: 'stockfish', score: 1, extra: conv(80) })));
    expect(line(p, 'conversion')).toBeUndefined();
    const w = waiting(p, 'conversion')!;
    expect(w.need).toEqual({ have: 0, of: 8, what: 'clearly winning positions vs people and Maia bots' });
    expect(w.note).toContain('25 clearly winning positions against Stockfish levels left out');
  });

  it('wins thrown away: a clear habit; saves below 8 wait', () => {
    const facts = middlegameLeaker(25, () => [], (i) => ({
      opponent: 'maia',
      score: i < 12 ? 0 : 0.5,
      extra: { ...conv(80), ...(i < 3 ? { save: { startPly: 25, win: 25 } } : {}) },
    }));
    const p = profileOf(facts);
    expect(line(p, 'conversion')).toMatchObject({ tone: 'habit', state: 'clear' });
    expect(line(p, 'conversion')!.text).toContain('Less than what those positions were worth');
    expect(waiting(p, 'saves')!.need).toEqual({ have: 3, of: 8, what: 'clearly losing positions vs people and Maia bots' });
  });
});

describe('profile: the clock', () => {
  it('no clocks: waits with "0 of 15 games with a clock"', () => {
    const p = profileOf(middlegameLeaker());
    expect(waiting(p, 'clock')!.need).toEqual({ have: 0, of: 15, what: 'games with a clock' });
  });

  it('errors pile up in time trouble: a clear habit with the ratio', () => {
    const p = profileOf(
      middlegameLeaker(25, () => [
        { phase: 'E', timeTrouble: true, clockMs: 5000, loss: 30 },
        { phase: 'E', timeTrouble: true, clockMs: 4000 },
        { phase: 'E', timeTrouble: false, clockMs: 60000 },
      ]),
    );
    const c = line(p, 'clock')!;
    expect(c).toMatchObject({ tone: 'habit', state: 'clear', format: 'ratio', reference: 1, n: 50, games: 25 });
    expect(c.text).toMatch(/^Your moves get worse when the clock runs low: 25 errors in 50 moves in time trouble/);
  });

  it('enough clocked games but few moves in time trouble: waits with "n of 30"', () => {
    const p = profileOf(middlegameLeaker(25, (i) => (i < 5 ? [{ phase: 'E', timeTrouble: true, clockMs: 5000 }] : [{ phase: 'E', timeTrouble: false, clockMs: 60000 }])));
    expect(waiting(p, 'clock')!.need).toEqual({ have: 5, of: 30, what: 'moves in time trouble' });
  });
});

describe('profile: the Focus', () => {
  const facts = middlegameLeaker(25, (i) => [{ oppThreat: true }, { oppThreat: true }, ...(i % 2 ? [{ oppThreat: true, loss: 30, motif: 'ignored-threat' as const }] : [])], () => ({
    opponent: 'human',
    score: 1,
    extra: { conversion: { startPly: 21, win: 70 } },
  }));

  it('the matching line says it is the Focus; only one line does', () => {
    const cases: [Parameters<typeof focusLineId>[0], string | null][] = [
      ['M:ignored-threat', 'threats'],
      ['conversion', 'conversion'],
      ['M:hanging', 'phase'],
      ['E:hanging', null],
      // The opening is not the problem here, so an opening Focus doesn't match the reassurance.
      ['O:hanging', null],
      ['time-trouble', null],
    ];
    for (const [id, expected] of cases) {
      const p = profileOf(facts, { style: 'club' }, id);
      expect(p.focus.lineId, String(id)).toBe(expected);
      expect(p.lines.filter((l) => l.isFocus).map((l) => l.id)).toEqual(expected ? [expected] : []);
    }
  });

  it('defaults to the model’s pick; "No Focus yet" texts', () => {
    const model = buildInsights(facts, { style: 'club' });
    expect(buildProfile(model).focus.id).toBe(model.focus?.id ?? null);
    const none = profileOf(facts, { style: 'club' }, null);
    expect(none.focus).toEqual({ id: null, lineId: null });
    expect(noFocusText(none)).toBe('No Focus yet: nothing stands out clearly enough to train.');
    expect(noFocusText({ ...none, games: 12 })).toBe('No Focus yet: 12 of 20 games.');
  });

  it('no line carries a training link of its own', () => {
    const p = profileOf(facts);
    for (const l of [...p.lines, ...p.waiting]) {
      expect(l).not.toHaveProperty('train');
      expect(JSON.stringify(l)).not.toContain('#/');
    }
  });
});

describe('profile: what each Review style sees', () => {
  const facts = middlegameLeaker(25, () => [], (i) => ({ opponent: i % 2 ? 'human' : 'maia', score: 1, extra: { conversion: { startPly: 21, win: 70 } } }));
  const p = profileOf(facts);

  it('Learner: one proven strength and the reassurance, clear lines only', () => {
    const v = learnerView(p);
    expect(v.strength?.id).toBe('conversion');
    expect(v.reassurance?.id).toBe('openings');
    // Leaning and habit lines never reach Learner.
    const leaning = profileOf(many(25, (i) => ({ opening: 'Italian Game', moves: [{ phase: 'M', loss: 30 }, ...(i % 2 ? [{ phase: 'O' as const, loss: 30 }] : [])] })));
    expect(learnerView(leaning)).toEqual({ strength: null, reassurance: null });
  });

  it('Club: clear and leaning lines, nothing waiting', () => {
    const lines = clubLines(p);
    expect(lines.every((l) => l.state === 'clear' || l.state === 'leaning')).toBe(true);
    expect(lines.length).toBe(p.lines.length);
  });

  it('every shown line carries n, games, group, a 90% interval and a state', () => {
    for (const l of p.lines) {
      expect(l.n).toBeGreaterThan(0);
      expect(l.games).toBeGreaterThan(0);
      expect(['all', 'human-like']).toContain(l.group);
      expect(['clear', 'leaning']).toContain(l.state);
      expect(l.estimate.lo).toBeLessThanOrEqual(l.estimate.value);
      expect(l.estimate.hi).toBeGreaterThanOrEqual(l.estimate.value);
    }
    for (const l of p.waiting) expect(l.state).toBe('not-enough');
  });
});

describe('profile: window, group and style note', () => {
  it('names the window and the groups; "mostly from bots" when bots are more than half', () => {
    const facts = middlegameLeaker(25, () => [], (i) => ({ opponent: i < 18 ? 'stockfish' : i < 22 ? 'maia' : 'human' }));
    const p = profileOf(facts);
    expect(windowText(p)).toBe('From your 25 reviewed games, 2026-10-01 – 2026-10-25: 18 vs Stockfish levels, 4 vs Maia bots, 3 vs people.');
    expect(p.groupNote).toBe('Mostly from games against bots (22 of 25).');
    expect(styleText(p)).toBe('Lines about how you play need 40 games at one speed against people and Maia bots: not enough yet (most so far: 7 rapid).');
  });

  it('follows the page filters', () => {
    const facts = [...middlegameLeaker(25, () => [], () => ({ opponent: 'human' })), ...middlegameLeaker(5, () => [], () => ({ opponent: 'maia' }), ).map((f, i) => ({ ...f, gameId: `m${i}` }))];
    const p = profileOf(facts, { style: 'club', opponent: 'human', speed: 'rapid' });
    expect(p.games).toBe(25);
    expect(p.filters).toEqual({ speed: 'rapid', opponent: 'human' });
    expect(p.groupNote).toBeNull();
    expect(windowText(p)).toContain('From your 25 reviewed rapid games');
  });
});

describe('profile: wording rules (decision §2, AC4)', () => {
  it('the banned list covers the decision’s words', () => {
    for (const s of ['You are a converter', 'a real attacker', 'a positional player', 'on tilt', 'because you rushed', 'typical for your level']) {
      expect(PROFILE_BANNED.some((r) => r.test(s)), s).toBe(true);
    }
    // Verbs about games are fine.
    for (const s of ['You converted 7 of 9', 'Your openings are not where you lose points.', CLOSING_LINE]) {
      expect(PROFILE_BANNED.some((r) => r.test(s)), s).toBe(false);
    }
  });

  it('no sentence any profile can produce matches the banned list', () => {
    const conv = (win: number) => ({ conversion: { startPly: 21, win } });
    const scenarios: GameFacts[][] = [
      middlegameLeaker(19),
      middlegameLeaker(),
      many(25, (i) => ({ opening: 'Italian Game', moves: [{ phase: 'M', loss: 30 }, ...(i % 2 ? [{ phase: 'O' as const, loss: 30 }] : [])] })),
      middlegameLeaker(25, (i) => [{ oppThreat: true }, { oppThreat: true }, ...(i % 2 ? [{ oppThreat: true, loss: 30, motif: 'ignored-threat' as const }] : [])]),
      middlegameLeaker(25, () => [], (i) => ({ opponent: i % 3 ? 'human' : 'stockfish', score: i % 2, extra: { ...conv(75), save: { startPly: 30, win: 25 } } })),
      middlegameLeaker(25, () => [{ phase: 'E', timeTrouble: true, clockMs: 5000, loss: 30 }, { phase: 'E', timeTrouble: true, clockMs: 4000 }]),
      middlegameLeaker(25, () => [{ phase: 'E', timeTrouble: true, clockMs: 5000 }, { phase: 'E', timeTrouble: false, clockMs: 9000, loss: 30 }], () => ({ extra: { lostOnTimeWhileBetter: true } })),
      many(25, () => ({ opening: 'Italian Game', moves: [{ phase: 'O', loss: 30 }, { phase: 'O', loss: 30 }, { phase: 'M', loss: 30 }] })),
    ];
    let checked = 0;
    for (const facts of scenarios) {
      for (const focusId of [null, 'M:ignored-threat', 'conversion', 'O:hanging'] as const) {
        const p = profileOf(facts, { style: 'analyst' }, focusId);
        for (const text of profileTexts(p)) {
          checked++;
          for (const r of PROFILE_BANNED) expect(r.test(text), `"${text}" matches ${r}`).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('profile: phase gate', () => {
  it('fewer than two phases past the card gate: the phase line waits with "n of 2"', () => {
    const p = profileOf(many(25, () => ({ moves: [{ phase: 'M', loss: 30 }] })));
    expect(waiting(p, 'phase')!.need).toEqual({ have: 1, of: 2, what: 'phases with 30 moves and 8 errors each' });
  });
});
