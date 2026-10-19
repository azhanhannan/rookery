import { describe, expect, it, vi } from 'vitest';
import { coachScript } from '../../src/review/coachScript';
import { SAMPLE_RECORD, SAMPLE_REVIEW } from '../fixtures/sample-review';

// Every move gets a second-person caption ("your knight"), to check it is only said about the player's own moves.
vi.mock('../../src/review/captions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/review/captions')>()),
  captionFactForMove: () => ({ kind: 'left-undefended', piece: 'n', square: 'f6', san: 'Bxf6' }),
}));

describe('coach walkthrough captions', () => {
  it("keeps a 'your' caption on your move, drops it on the opponent's", () => {
    const steps = coachScript({ record: SAMPLE_RECORD, review: SAMPLE_REVIEW, style: 'club' });
    const caption = 'This left your knight on f6 undefended — Bxf6 wins it.';
    expect(steps.find((s) => s.movePly === 13)!.lines).toContain(caption);
    const theirs = steps.find((s) => s.movePly === 14)!.lines;
    expect(theirs).not.toContain(caption);
    expect(theirs[2]).toBe('This let the advantage slip: the engine preferred Ne5.');
  });
});
