import { describe, expect, it } from 'vitest';
import type { GameSummary } from '../../src/api/types';
import {
  dayLabel,
  endedText,
  fullMoves,
  groupByDay,
  matchesFilter,
  outcomeOf,
  resultLabel,
  statsOf,
  summaryFromRecord,
  timeControlLabel,
} from '../../src/account/gamesList';
import { FOOLS_MATE, play } from './helpers';

function g(over: Partial<GameSummary>): GameSummary {
  return {
    clientId: Math.random().toString(36),
    white: 'You',
    black: 'Bot',
    result: '1-0',
    userColor: 'w',
    opponentName: 'Bot',
    rated: false,
    category: null,
    moves: 20,
    hasReview: false,
    playedAt: '2026-10-14T10:00:00',
    finalFen: '8/8/8/8/8/8/8/8 w - - 0 1',
    ...over,
  };
}

describe('outcome and labels', () => {
  it('is from the account holder side', () => {
    expect(outcomeOf(g({ result: '1-0', userColor: 'w' }))).toBe('won');
    expect(outcomeOf(g({ result: '1-0', userColor: 'b' }))).toBe('lost');
    expect(outcomeOf(g({ result: '0-1', userColor: 'b' }))).toBe('won');
    expect(outcomeOf(g({ result: '1/2-1/2' }))).toBe('drawn');
    expect(outcomeOf(g({ userColor: null }))).toBe('none');
    expect(resultLabel(g({ userColor: null, result: '0-1' }))).toBe('0-1');
    expect(resultLabel(g({ userColor: null, result: '1/2-1/2' }))).toBe('½-½');
    expect(resultLabel(g({ result: '1/2-1/2' }))).toBe('Draw');
  });

  it('time control, ending and full moves', () => {
    expect(timeControlLabel('180+2')).toBe('3+2');
    expect(timeControlLabel(undefined)).toBe('Unlimited');
    expect(endedText('checkmate')).toBe('by checkmate');
    expect(endedText('timeout vs insufficient material')).toBe('on time');
    expect(endedText(undefined)).toBeNull();
    expect(fullMoves(41)).toBe(21);
    expect(fullMoves(6)).toBe(3);
  });
});

describe('filters and stats', () => {
  const games = [
    g({ result: '1-0', rated: true }),
    g({ result: '0-1', rated: true }),
    g({ result: '1/2-1/2' }),
    g({ result: '1-0', userColor: null }),
  ];

  it('filters by outcome and rated', () => {
    expect(games.filter((x) => matchesFilter(x, 'won'))).toHaveLength(1);
    expect(games.filter((x) => matchesFilter(x, 'lost'))).toHaveLength(1);
    expect(games.filter((x) => matchesFilter(x, 'drawn'))).toHaveLength(1);
    expect(games.filter((x) => matchesFilter(x, 'rated'))).toHaveLength(2);
    expect(games.filter((x) => matchesFilter(x, 'casual'))).toHaveLength(2);
    expect(games.filter((x) => matchesFilter(x, 'all'))).toHaveLength(4);
  });

  it('counts the record; games without a side only count in the total', () => {
    expect(statsOf(games)).toEqual({ total: 4, won: 1, lost: 1, drawn: 1 });
  });
});

describe('day groups', () => {
  const now = new Date(2026, 9, 14, 15, 0);

  it('labels today, yesterday, then dates', () => {
    expect(dayLabel(new Date(2026, 9, 14, 1, 0), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 13, 23, 59), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 10), now)).not.toMatch(/Today|Yesterday|2026/);
    expect(dayLabel(new Date(2025, 9, 10), now)).toMatch(/2025/);
  });

  it('groups consecutive games by local day', () => {
    const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();
    const groups = groupByDay([g({ playedAt: at(14, 12) }), g({ playedAt: at(14, 9) }), g({ playedAt: at(12, 20) })], now);
    expect(groups.map((x) => [x.label, x.games.length])).toEqual([
      ['Today', 2],
      [dayLabel(new Date(2026, 9, 12), now), 1],
    ]);
  });
});

describe('summaryFromRecord', () => {
  it('shows a local bot game like a saved one', () => {
    const record = { ...play(FOOLS_MATE), black: { name: 'Bot 800', isBot: true, elo: 800 } };
    const s = summaryFromRecord(record);
    expect(s).toMatchObject({ userColor: 'w', opponentName: 'Bot 800', result: '0-1', moves: 4, rated: false });
    expect(s.finalFen).toBe(record.moves[3].fenAfter);
    expect(outcomeOf(s)).toBe('lost');
  });

  it('two people at one screen: no side', () => {
    expect(summaryFromRecord(play(FOOLS_MATE)).userColor).toBeNull();
  });
});
