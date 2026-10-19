import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeFact, LineStory, LineStoryInput } from '../../src/review/why';
import { SAMPLE_REVIEW } from '../fixtures/sample-review';

// explainMove combines the two sources; both are mocked here (they have their own tests).
const story = vi.hoisted(() => ({ value: { played: [], better: [] } as LineStory }));
const changes = vi.hoisted(() => ({ value: [] as ChangeFact[] }));
const lineStory = vi.hoisted(() => vi.fn((_i: LineStoryInput, _s: string) => story.value));
const positionChanges = vi.hoisted(() => vi.fn((..._a: unknown[]) => changes.value));
vi.mock('../../src/review/lineStory', () => ({ lineStory }));
vi.mock('../../src/review/positionChanges', () => ({ positionChanges }));

const { explainMove, lineBaseFor, offersWhy } = await import('../../src/review/why');

const fact = (kind: string, text: string, weight: number): ChangeFact => ({ kind, text, weight, side: 'own' });

beforeEach(() => {
  story.value = { played: [], better: [] };
  changes.value = [];
  lineStory.mockClear();
  positionChanges.mockClear();
});

describe('explainMove', () => {
  it('builds the line-story input from the review: positions around the move, its lines and win chances', () => {
    // Ply 17 of the sample is 9. h3 (Blunder).
    explainMove(SAMPLE_REVIEW, 17, 'club');
    const m = SAMPLE_REVIEW.moves[16];
    expect(lineStory).toHaveBeenCalledWith(
      {
        fenBefore: SAMPLE_REVIEW.positions[16].fen,
        played: m.uci,
        mover: 'w',
        lineAfter: SAMPLE_REVIEW.positions[17].bestLine,
        lineBefore: SAMPLE_REVIEW.positions[16].bestLine,
        winBefore: m.winBefore,
        winAfter: m.winAfter,
      },
      'club',
    );
    expect(positionChanges).toHaveBeenCalledWith(SAMPLE_REVIEW.positions[16].fen, SAMPLE_REVIEW.positions[17].fen, 'w', 17, 'club');
  });

  it('passes both parts through, changes highest weight first', () => {
    story.value = {
      played: [{ kind: 'mate', text: 'Black mates in 2.', line: ['c6d4'] }],
      better: [{ kind: 'safe', text: 'g3 keeps the king safe.' }],
    };
    changes.value = [fact('development', 'One more piece developed.', 1), fact('king-shield', 'The pawn in front of your king moved.', 5)];
    const why = explainMove(SAMPLE_REVIEW, 17, 'analyst');
    expect(why.ply).toBe(17);
    expect(why.story).toEqual(story.value);
    expect(why.changes.map((c) => c.kind)).toEqual(['king-shield', 'development']);
  });

  it('drops change facts that repeat the story (same kind or same sentence) or the caption', () => {
    story.value = { played: [{ kind: 'check', text: 'Then comes a check.' }], better: [] };
    changes.value = [
      fact('check', 'Something else about checks.', 3),
      fact('other', 'then comes a check', 2),
      // Ply 19 (10. Nxd4) has the caption "This allowed mate in 1 (Qh2#)."
      fact('caption-like', 'This allowed mate in 1 (Qh2#).', 2),
      fact('castling', 'You can no longer castle.', 1),
    ];
    expect(explainMove(SAMPLE_REVIEW, 19, 'club').changes.map((c) => c.kind)).toEqual(['castling']);
  });

  it('is empty, without calling either source, for a ply out of range', () => {
    for (const ply of [0, -1, 1.5, SAMPLE_REVIEW.moves.length + 1]) {
      expect(explainMove(SAMPLE_REVIEW, ply, 'learner')).toEqual({ ply, story: { played: [], better: [] }, changes: [] });
    }
    expect(lineStory).not.toHaveBeenCalled();
    expect(positionChanges).not.toHaveBeenCalled();
  });

  it('is empty when a position is missing', () => {
    const cut = { ...SAMPLE_REVIEW, positions: SAMPLE_REVIEW.positions.slice(0, 17) };
    expect(explainMove(cut, 17, 'club').changes).toEqual([]);
    expect(lineStory).not.toHaveBeenCalled();
  });
});

describe('offersWhy', () => {
  it('weak labels in every style; any move in Analyst', () => {
    for (const label of ['Inaccuracy', 'Mistake', 'Blunder', 'Miss'] as const) expect(offersWhy(label, 'learner')).toBe(true);
    expect(offersWhy('Good', 'club')).toBe(false);
    expect(offersWhy('Best', 'learner')).toBe(false);
    expect(offersWhy('Best', 'analyst')).toBe(true);
  });
});

describe('lineBaseFor', () => {
  const before = SAMPLE_REVIEW.positions[16].fen;
  const after = SAMPLE_REVIEW.positions[17].fen;
  it('plays from the position before or after the move, matching on the board part of the FEN', () => {
    expect(lineBaseFor(SAMPLE_REVIEW, 17, { kind: 'x', text: '', line: ['g2g3'], fromFen: before })).toBe(16);
    const counters = after.split(' ').slice(0, 4).join(' ') + ' 7 99';
    expect(lineBaseFor(SAMPLE_REVIEW, 17, { kind: 'x', text: '', line: ['c6d4'], fromFen: counters })).toBe(17);
  });
  it('no Show without a line, without fromFen, or from another position', () => {
    expect(lineBaseFor(SAMPLE_REVIEW, 17, { kind: 'x', text: '', fromFen: before })).toBeNull();
    expect(lineBaseFor(SAMPLE_REVIEW, 17, { kind: 'x', text: '', line: [], fromFen: before })).toBeNull();
    expect(lineBaseFor(SAMPLE_REVIEW, 17, { kind: 'x', text: '', line: ['g2g3'] })).toBeNull();
    expect(lineBaseFor(SAMPLE_REVIEW, 17, { kind: 'x', text: '', line: ['e2e4'], fromFen: SAMPLE_REVIEW.positions[0].fen })).toBeNull();
  });
});
