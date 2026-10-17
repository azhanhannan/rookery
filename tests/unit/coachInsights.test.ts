import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { CoachEvidence, HomeworkItem } from '../../src/api/types';
import { bucketName, evidenceHomeworkItem, homeworkFromEvidence, homeworkTitleFor, isFocusBucket } from '../../src/coach/insights';
import { homeworkItemError } from '../../src/coach/homework';
import { COACH } from '../../src/config/tunables';
import { makeGame } from '../fixtures/insights';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3';

describe('coach insights helpers', () => {
  it('only real, non-"other" buckets can be a coach Focus', () => {
    expect(isFocusBucket('E:hanging')).toBe(true);
    expect(isFocusBucket('M:fork')).toBe(true);
    expect(isFocusBucket('time-trouble')).toBe(true);
    expect(isFocusBucket('conversion')).toBe(true);
    expect(isFocusBucket('O:other')).toBe(false);
    expect(isFocusBucket('X:hanging')).toBe(false);
    expect(isFocusBucket(42)).toBe(false);
  });

  it('names buckets for the coach', () => {
    expect(bucketName('E:hanging')).toBe('Endgame: pieces left hanging');
    expect(bucketName('time-trouble')).toBe('Time trouble');
    expect(homeworkTitleFor('M:missed-mate').length).toBeLessThanOrEqual(COACH.maxTitleChars);
  });

  it('builds a homework item from the position before the player’s move, with its source', () => {
    const game = makeGame({ id: 'g1', engine: { 4: { bestMove: 'e2e4', bestLine: ['e2e4', 'e7e5'] } } });
    const item = evidenceHomeworkItem(game, 5, 'w');
    expect(item).toEqual({ fen: START, solution: ['e2e4'], source: { gameClientId: 'g1', ply: 5 } });
    expect(homeworkItemError(item)).toBeNull();
  });

  it('extends the solution through a forced mate', () => {
    // Scholar's mate set-up: White mates with Qxf7.
    const sans = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'a3', 'a6'];
    const game = makeGame({ id: 'g2', sans, engine: { 6: { bestMove: 'h5f7', bestLine: ['h5f7'], score: { mate: 1 } } } });
    // Ply 7 (a3) was White's move; the position before it had Qxf7#.
    expect(evidenceHomeworkItem(game, 7, 'w')?.solution).toEqual(['h5f7']);
  });

  it('gives no item for the opponent’s move, an unreviewed game or a position without a best move', () => {
    const game = makeGame({ id: 'g1', engine: { 4: { bestMove: 'e2e4' } } });
    expect(evidenceHomeworkItem(game, 6, 'w')).toBeNull(); // Black's move
    expect(evidenceHomeworkItem(game, 3, 'w')).toBeNull(); // no engine line stored there
    expect(evidenceHomeworkItem(makeGame({ reviewed: false }), 5, 'w')).toBeNull();
    expect(evidenceHomeworkItem(makeGame({ engine: { 4: { bestMove: 'e2e5' } } }), 5, 'w')).toBeNull(); // illegal
  });

  it('turns a card’s evidence into one homework set: usable positions, each once, capped', () => {
    const item = (fen: string, ply: number): HomeworkItem => ({ fen, solution: ['e2e4'], source: { gameClientId: `g${ply}`, ply } });
    const ev = (homework: HomeworkItem | null, ply: number): CoachEvidence => ({
      clientId: `g${ply}`,
      ply,
      loss: 30,
      fen: START,
      san: 'Nf3',
      motif: 'other',
      phase: 'O',
      opponentName: 'Opp',
      playedAt: '2026-10-01T00:00:00.000Z',
      color: 'w',
      homework,
    });
    const other = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1';
    // Same board, different clocks: one position.
    const same = START.replace(' 4 3', ' 0 1');
    const out = homeworkFromEvidence([ev(item(START, 5), 5), ev(null, 7), ev(item(same, 9), 9), ev(item(other, 11), 11)]);
    expect(out.map((i) => i.source?.ply)).toEqual([5, 11]);

    // More distinct positions than a set can hold: after each of White's 20 first moves, then Black's 20 replies to e4.
    const fens = new Chess().moves().map((m) => new Chess().move(m).after);
    const afterE4 = new Chess();
    afterE4.move('e4');
    fens.push(...afterE4.moves().map((m) => new Chess(afterE4.fen()).move(m).after));
    const many = fens.map((f, i) => ev(item(f, i + 1), i + 1));
    expect(homeworkFromEvidence(many)).toHaveLength(COACH.maxHomeworkItems);
  });
});
