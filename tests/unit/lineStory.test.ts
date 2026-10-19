// "Why?" line story: what the stored engine line provably does after the move played, and after the engine's
// better move. Positives for every kind, the near misses that must stay silent, robustness, and style limits.
import { describe, expect, it } from 'vitest';
import { WHY_STORY } from '../../src/config/tunables';
import { lineStory } from '../../src/review/lineStory';
import type { ReviewStyle } from '../../src/review/reviewStyle';
import type { LineStoryInput } from '../../src/review/why';

const input = (fenBefore: string, played: string, lineAfter: string[], lineBefore: string[] = []): LineStoryInput => ({
  fenBefore,
  played,
  mover: fenBefore.split(' ')[1] === 'b' ? 'b' : 'w',
  lineAfter,
  lineBefore,
  winBefore: 50,
  winAfter: 20,
});

const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
// Nc7+ forks the king on e8 and the rook on a8.
const FORK = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
const forkInput = input(FORK, 'e1e2', ['a8a1'], ['d5c7', 'e8d7', 'c7a8', 'd7c6']);

describe('lineStory: after the move played', () => {
  it('loses material: the move takes a pawn and the reply wins the knight back', () => {
    const s = lineStory(input(ITALIAN, 'f3e5', ['c6e5', 'd2d4', 'e5c6', 'd4d5', 'c6e7']), 'club');
    expect(s.played).toEqual([
      { text: 'After 3.Nxe5 Nxe5, Black wins a knight for a pawn.', kind: 'loses-material', line: ['f3e5', 'c6e5'], fromFen: ITALIAN },
    ]);
  });

  it('narration starts at the reply when the move itself took nothing, and names the check it ends on', () => {
    // 1.Ke3?? walks off the bishop's guard: Qxe1+ takes it with check.
    const fen = '4k3/8/8/q7/8/8/4K3/4B3 w - - 0 1';
    const s = lineStory(input(fen, 'e2e3', ['a5e1', 'e3d3', 'e8d7']), 'club');
    expect(s.played[0]).toMatchObject({ kind: 'loses-material', text: 'After 1...Qxe1+, Black wins a bishop and gives check.', line: ['a5e1'] });
    expect(s.played[0].fromFen).toBe('4k3/8/8/q7/8/4K3/8/4B3 b - - 1 1');
  });

  it('an even trade is not "wins material"', () => {
    const s = lineStory(input(ITALIAN, 'f1b5', ['a7a6', 'b5c6', 'd7c6', 'e1g1', 'f7f6']), 'analyst');
    expect(s.played).toEqual([]);
  });

  it('mate in the line says it all', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
    const s = lineStory(input(fen, 'g2g4', ['d8h4']), 'club');
    expect(s.played).toEqual([{ text: 'Black mates: 2...Qh4#.', kind: 'mate', line: ['d8h4'], fromFen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2' }]);
    expect(lineStory(input(fen, 'g2g4', ['d8h4']), 'learner').played[0].text).toBe('Black mates: Qh4#.');
  });

  it('a run of checks that drives the king', () => {
    const fen = '6k1/5ppp/8/8/8/6P1/q4P1P/6K1 w - - 0 1';
    const s = lineStory(input(fen, 'h2h4', ['a2b1', 'g1g2', 'b1e4', 'g2h2', 'e4e5']), 'club');
    expect(s.played).toEqual([
      { text: 'Black keeps checking: 1...Qb1+ 2.Kg2 Qe4+.', kind: 'check', line: ['a2b1', 'g1g2', 'b1e4'], fromFen: '6k1/5ppp/8/8/7P/6P1/q4P2/6K1 b - - 0 1' },
    ]);
    expect(lineStory(input(fen, 'h2h4', ['a2b1', 'g1g2', 'b1e4', 'g2h2', 'e4e5']), 'learner').played[0].text).toBe('Black gives check after check.');
  });

  it('a single check that leads nowhere says nothing', () => {
    const fen = '6k1/5ppp/8/8/8/6P1/q4P1P/6K1 w - - 0 1';
    expect(lineStory(input(fen, 'h2h4', ['a2b1', 'g1g2', 'b1b2', 'g2h3']), 'analyst').played).toEqual([]);
  });

  it('a promotion that stands', () => {
    const s = lineStory(input('8/P7/8/8/8/8/k7/4K3 w - - 0 1', 'e1d2', ['a2b3', 'a7a8q']), 'club');
    // The vague "wins material" it makes is left to the promotion sentence.
    expect(s.played).toEqual([
      { text: 'White promotes a pawn to a queen: 2.a8=Q.', kind: 'promotion', line: ['a2b3', 'a7a8q'], fromFen: '8/P7/8/8/8/8/k2K4/8 b - - 1 1' },
    ]);
  });

  it('a piece left en prise when the stored line runs out after the mover\'s move', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2';
    const s = lineStory(input(fen, 'f3d4', []), 'club');
    expect(s.played).toEqual([
      { text: "White's knight on d4 ends the line attacked and undefended.", kind: 'hangs-at-end', line: [], fromFen: 'rnbqkbnr/pppp1ppp/8/4p3/3NP3/8/PPPP1PPP/RNBQKB1R b KQkq - 1 2' },
    ]);
    // The line goes on with a reply that leaves it: White is to move and can save it, so nothing is claimed.
    expect(lineStory(input(fen, 'f3d4', ['g8f6']), 'club').played).toEqual([]);
  });

  it('nothing is claimed past the horizon', () => {
    // The bishop takes the rook on h1 only at ply 8.
    const fen = '4k3/8/2b5/8/8/8/8/4K2R w - - 0 1';
    const line = ['e8d8', 'd2e2', 'd8e8', 'e2d2', 'e8d8', 'd2e2', 'c6h1'];
    expect(WHY_STORY.horizon).toBeLessThan(8);
    expect(lineStory(input(fen, 'e1d2', line), 'analyst').played).toEqual([]);
  });

  it('a win the line gives back past the horizon shrinks to what it keeps', () => {
    // 6.Bb5?? cxb5 7.a4 bxa4 is a bishop and a pawn, but the stored line later wins the pawn back (Qxh5).
    const fen = 'r2qkb1r/pp1npppp/2p2n2/3p1b2/3P1B2/2N1PN2/PPP2PPP/R2QKB1R w KQkq - 1 6';
    const line = ['c6b5', 'a2a4', 'b5a4', 'f3e5', 'h7h5', 'e1g1', 'a8c8', 'f2f3', 'e7e6', 'e3e4', 'd5e4', 'f3e4', 'f5h7', 'e5d7', 'f6d7', 'd1h5'];
    expect(lineStory(input(fen, 'f1b5', line), 'analyst').played).toEqual([
      { text: 'After 6...cxb5, Black wins a bishop (+3).', kind: 'loses-material', line: ['c6b5'], fromFen: 'r2qkb1r/pp1npppp/2p2n2/1B1p1b2/3P1B2/2N1PN2/PPP2PPP/R2QK2R b KQkq - 2 6' },
    ]);
    // Read only up to the horizon, it would have said "a bishop and a pawn".
    expect(lineStory(input(fen, 'f1b5', line.slice(0, 5)), 'club').played[0].text).toBe('After 6...cxb5 7.a4 bxa4, Black wins a bishop and a pawn.');
  });
});

describe('lineStory: the better move', () => {
  it('a fork that wins a rook, and Black provably can\'t save both', () => {
    const s = lineStory(forkInput, 'club');
    expect(s.played).toEqual([]);
    expect(s.better).toEqual([
      { text: 'After 1.Nc7+ Kd7 2.Nxa8, White wins a rook.', kind: 'wins-material', line: ['d5c7', 'e8d7', 'c7a8'], fromFen: FORK },
      { text: "1.Nc7+ attacks Black's king and rook at once, and Black can't save both.", kind: 'attacks-two', line: ['d5c7'], fromFen: FORK },
    ]);
  });

  it('a double attack on two loose pieces, proven against every reply', () => {
    const fen = '6k1/n7/8/8/7b/8/6PP/3Q3K w - - 0 1';
    const s = lineStory(input(fen, 'h2h3', [], ['d1d4', 'g8f7', 'd4h4']), 'club');
    expect(s.better.map((x) => x.text)).toEqual([
      'After 1.Qd4 Kf7 2.Qxh4, White wins a bishop.',
      "1.Qd4 attacks Black's bishop and knight at once, and Black can't save both.",
    ]);
  });

  it('no "can\'t save both" when a reply (here a check) answers it', () => {
    const fen = '4r1k1/n7/8/8/7b/8/5PPP/R2Q2K1 w - - 0 1';
    const s = lineStory(input(fen, 'h2h3', [], ['d1d4']), 'club');
    expect(s.better).toEqual([{ text: "1.Qd4 attacks Black's bishop and knight at once.", kind: 'attacks-two', line: ['d1d4'], fromFen: fen }]);
  });

  it('a fork onto a defended square is no double attack', () => {
    // Nc7+ Bxc7: the bishop on b8 just takes the knight.
    const s = lineStory(input('rb2k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'e1e2', [], ['d5c7', 'b8c7']), 'analyst');
    expect(s.better).toEqual([]);
  });

  it('promotion, and a promotion taken at once is silent', () => {
    const s = lineStory(input('8/P7/8/8/8/8/k7/4K3 w - - 0 1', 'e1d2', [], ['a7a8q', 'a2b3', 'a8b7', 'b3c4']), 'analyst');
    expect(s.better.map((x) => x.kind)).toEqual(['promotion']);
    expect(s.better[0].text).toBe('White promotes a pawn to a queen: 1.a8=Q+.');
    expect(lineStory(input('1r6/P7/8/8/8/8/k7/4K3 w - - 0 1', 'e1d2', [], ['a7a8q', 'b8a8']), 'analyst').better).toEqual([]);
  });

  it('mate by the better move', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    expect(lineStory(input(fen, 'g1f2', [], ['a1a8']), 'analyst').better).toEqual([
      { text: 'White mates: 1.Ra8#.', kind: 'mate', line: ['a1a8'], fromFen: fen },
    ]);
  });

  it('empty when the move played is the engine\'s move (any case), or when there is no engine line', () => {
    expect(lineStory(input(ITALIAN, 'f3e5', ['c6e5'], ['F3E5', 'c6e5']), 'club').better).toEqual([]);
    expect(lineStory(input(ITALIAN, 'f3e5', ['c6e5'], []), 'club').better).toEqual([]);
  });

  it('an even trade by the better move says nothing', () => {
    expect(lineStory(input(ITALIAN, 'h2h3', [], ['f1b5', 'a7a6', 'b5c6', 'd7c6', 'e1g1']), 'analyst').better).toEqual([]);
  });
});

describe('lineStory: robustness', () => {
  it('stops at an illegal move and keeps what the legal part proves', () => {
    const s = lineStory(input(ITALIAN, 'f3e5', ['c6e5', 'h9h9', 'e5c6']), 'club');
    expect(s.played.map((x) => x.text)).toEqual(['After 3.Nxe5 Nxe5, Black wins a knight for a pawn.']);
  });

  it('an illegal move played, a garbage FEN or empty lines never throw', () => {
    expect(lineStory(input(ITALIAN, 'e2e5', ['c6e5'], ['f1b5']), 'club').played).toEqual([]);
    expect(lineStory({ ...input(ITALIAN, 'f3e5', ['c6e5']), fenBefore: 'not a fen' }, 'club')).toEqual({ played: [], better: [] });
    expect(lineStory(input(ITALIAN, 'f1c4', [], []), 'club')).toEqual({ played: [], better: [] });
    expect(lineStory(input(ITALIAN, 'f1c4', ['zz'], ['qq']), 'learner')).toEqual({ played: [], better: [] });
  });
});

describe('lineStory: style limits', () => {
  const styles: ReviewStyle[] = ['learner', 'club', 'analyst'];

  it('caps the sentences per section by style', () => {
    for (const style of styles) {
      const s = lineStory(forkInput, style);
      expect(s.better.length).toBe(Math.min(2, WHY_STORY.maxSentences[style]));
    }
  });

  it('Learner: no move numbers, at most two moves, and a long line is told without moves', () => {
    const s = lineStory(forkInput, 'learner');
    expect(s.better).toEqual([{ text: 'With best play, White wins a rook.', kind: 'wins-material', line: ['d5c7', 'e8d7', 'c7a8'], fromFen: FORK }]);
    const t = lineStory(input(ITALIAN, 'f3e5', ['c6e5', 'd2d4']), 'learner').played[0].text;
    expect(t).toBe('After Nxe5 and Nxe5, Black wins a knight for a pawn.');
    expect(t).not.toMatch(/\d\.|\(\+/);
  });

  it('Club shortens a long line to its first and last move; Analyst adds the material in pawns', () => {
    const fen = '6k1/n7/8/8/7b/8/6PP/3Q3K w - - 0 1';
    const line = ['h2h3', 'g8f8', 'd1d4', 'f8e8', 'd4h4'];
    expect(lineStory(input(fen, 'g2g3', [], line), 'club').better[0].text).toBe('After 1.h3 … 3.Qxh4, White wins a bishop.');
    expect(lineStory(input(fen, 'g2g3', [], line), 'analyst').better[0].text).toBe('After 1.h3 Kf8 2.Qd4 Ke8 3.Qxh4, White wins a bishop (+3).');
  });
});
