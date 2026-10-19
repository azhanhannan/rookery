import { describe, expect, it } from 'vitest';
import { coachWarning, coachWarningText } from '../../src/game/coachWatch';
import { hangingPieces } from '../../src/game/hanging';

describe('coachWarning: positives', () => {
  it('a bishop dropped where a pawn takes it for free (1.e4 e5 2.Ba6)', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const w = coachWarning(fen, 'f1a6');
    expect(w).toMatchObject({ kind: 'material', piece: 'b', square: 'a6', free: true });
    expect(coachWarningText(w!)).toBe('Careful: your bishop on a6 can be taken for free.');
  });

  it('the queen walks into a bishop (1.e4 d5 2.Qg4)', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    expect(coachWarning(fen, 'd1g4')).toMatchObject({ kind: 'material', piece: 'q', square: 'g4', by: 'b', free: true, loss: 9 });
  });

  it('a defended rook attacked by a pawn', () => {
    const fen = '4k3/8/2p5/8/4P3/8/8/3RK3 w - - 0 1';
    const w = coachWarning(fen, 'd1d5');
    expect(w).toMatchObject({ kind: 'material', piece: 'r', square: 'd5', by: 'p', free: false, loss: 4 });
    expect(coachWarningText(w!)).toBe('Careful: your rook on d5 can be taken by a pawn.');
  });

  it('an ignored threat: castling while a6 still attacks the b5 bishop (Ruy Lopez 4.O-O?)', () => {
    const fen = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
    expect(coachWarning(fen, 'e1g1')).toMatchObject({ kind: 'material', piece: 'b', square: 'b5', by: 'p', free: true });
  });

  it('a knight left en prise by an unrelated pawn move', () => {
    const fen = '4k3/8/2b5/8/N7/8/7P/4K3 w - - 0 1';
    expect(coachWarning(fen, 'h2h3')).toMatchObject({ kind: 'material', piece: 'n', square: 'a4', free: true });
  });

  it("allowed mate in 1: fool's mate (1.f3 e5 2.g4)", () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
    const w = coachWarning(fen, 'g2g4');
    expect(w).toEqual({ kind: 'mate', san: 'Qh4#' });
    expect(coachWarningText(w!)).toBe('Careful: that lets your opponent checkmate you in one move (Qh4#).');
  });

  it("allowed mate in 1 for Black: scholar's mate (3...Nf6)", () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    expect(coachWarning(fen, 'g8f6')).toEqual({ kind: 'mate', san: 'Qxf7#' });
  });
});

describe('coachWarning: near misses stay quiet', () => {
  it('normal opening moves', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(coachWarning(start, 'e2e4')).toBeNull();
    const ruy = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
    expect(coachWarning(ruy, 'b5a4')).toBeNull();
  });

  it('an even trade (Bxc6 in the Ruy Lopez)', () => {
    const fen = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
    expect(coachWarning(fen, 'b5c6')).toBeNull();
  });

  it('a defended knight attacked only by a queen', () => {
    const fen = '4k3/4q3/8/8/3P4/5N2/8/4K3 w - - 0 1';
    expect(coachWarning(fen, 'f3e5')).toBeNull();
  });

  it('a piece "attacked" by a pinned knight (the hanging glow would flag it)', () => {
    const fen = '4k3/8/4n3/8/8/8/1B2R3/K7 w - - 0 1';
    expect(coachWarning(fen, 'b2d4')).toBeNull();
    expect(hangingPieces('4k3/8/4n3/8/3B4/8/4R3/K7 b - - 1 1', 'w')).toEqual(['d4']);
  });

  it('a pawn drop is below the bar', () => {
    const fen = '4k3/8/2b5/8/4P3/8/8/4K3 w - - 0 1';
    expect(coachWarning(fen, 'e1d1')).toBeNull();
  });

  it('a checking sacrifice (Bxf7+ in the Two Knights)', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    expect(coachWarning(fen, 'c4f7')).toBeNull();
  });

  it('a bait: taking the queen allows a back-rank mate', () => {
    const fen = '2r3k1/5ppp/8/8/8/8/2Q2PPP/4R1K1 w - - 0 1';
    expect(coachWarning(fen, 'c2c7')).toBeNull();
  });

  it('a counter-attack: the knight hangs but d4 hits the queen', () => {
    // (King on h2, not h1: there Bxe4 would come with check and the queen would escape: a real loss.)
    const fen = '6k1/1b6/8/2q5/4N3/8/3P3K/8 w - - 0 1';
    expect(coachWarning(fen, 'd2d4')).toBeNull();
  });

  it('a loss nothing could avoid (a pawn forks two knights)', () => {
    const fen = '7k/8/8/8/3p4/2N1N3/8/7K w - - 0 1';
    expect(coachWarning(fen, 'h1g1')).toBeNull();
  });

  it('a mate nothing could avoid', () => {
    const fen = 'r7/8/8/8/8/8/P4k2/7K w - - 0 1';
    expect(coachWarning(fen, 'a2a3')).toBeNull();
  });

  it('the move itself mates, or the input is not a legal move', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/5n2/PPPP1PPP/RNB1K1NR w KQkq - 0 1';
    expect(coachWarning(fen, 'h5f7')).toBeNull();
    expect(coachWarning(fen, 'e1e3')).toBeNull();
    expect(coachWarning('not a fen', 'e2e4')).toBeNull();
  });

  it('is quick enough to run after every move', () => {
    // A busy middlegame where the played move hangs nothing: every alternative check is skipped.
    const fen = 'r2q1rk1/pp2bppp/2n1bn2/2pp4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 9';
    const t = performance.now();
    for (let i = 0; i < 5; i++) coachWarning(fen, 'h2h3');
    expect((performance.now() - t) / 5).toBeLessThan(150);
  });
});
