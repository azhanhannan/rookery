// "What changed" facts for Why? (src/review/positionChanges.ts): a positive for every kind, and the near misses
// that must stay silent (a fact shown on the wrong move is noise).
import { describe, expect, it } from 'vitest';
import { findMove } from '../../src/review/brilliant';
import { positionChanges } from '../../src/review/positionChanges';
import type { ReviewStyle } from '../../src/review/reviewStyle';
import type { ChangeFact } from '../../src/review/why';

/** The facts for `uci` played from `fen` (the mover is the side to move). */
function changes(fen: string, uci: string, style: ReviewStyle = 'analyst', ply = 1): ChangeFact[] {
  const m = findMove(fen, uci);
  if (!m) throw new Error(`illegal ${uci} in ${fen}`);
  return positionChanges(fen, m.after, m.color, ply, style);
}
const kinds = (facts: ChangeFact[]) => facts.map((f) => f.kind);
const one = (facts: ChangeFact[], kind: string) => facts.find((f) => f.kind === kind);

// White castled (Kg1, pawns f2 g2 h2), Black has all pieces.
const CASTLED = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7';

describe('positionChanges: king shield', () => {
  it('a pawn pushed out of the cover in front of the castled king', () => {
    const f = one(changes(CASTLED, 'g2g4', 'club'), 'king-shield')!;
    expect(f.side).toBe('own');
    expect(f.text).toBe('This pushed the g-pawn out of the cover in front of your king.');
  });

  it('analyst names the squares left without pawn cover (not f3: the knight stands there)', () => {
    expect(one(changes(CASTLED, 'g2g4'), 'king-shield')!.text).toBe(
      'This pushed the g-pawn (g2-g4) out of the cover in front of your king, leaving h3 without pawn cover.',
    );
  });

  it('a capture off the file opens it towards the king (and doubles the f-pawns)', () => {
    // ...Nf3+ and gxf3: no white pawn left on the g-file.
    const fen = 'r1bq1rk1/pppp1ppp/2n5/2b1p3/2B1P3/2NP1n2/PPP2PPP/R1BQ1RK1 w - - 0 7';
    const facts = changes(fen, 'g2f3', 'club');
    expect(kinds(facts)).toEqual(['king-shield', 'doubled-pawns']);
    expect(facts[0].text).toBe('This took the g-pawn out of the cover in front of your king, opening the g-file towards it.');
    expect(facts[1].text).toBe('This doubled your pawns on the f-file.');
  });

  it('not for a pawn that stays in the shelter (h3), nor for a centre pawn', () => {
    expect(kinds(changes(CASTLED, 'h2h3'))).not.toContain('king-shield');
    expect(kinds(changes(CASTLED, 'd3d4'))).not.toContain('king-shield');
  });

  it('not in front of an uncastled king', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6';
    expect(kinds(changes(fen, 'g2g4'))).not.toContain('king-shield');
  });

  it('not when the opponent has too little left to attack with', () => {
    expect(changes('4k3/pp6/8/8/8/8/5PPP/3R2K1 w - - 0 30', 'g2g4')).toEqual([]);
  });
});

describe('positionChanges: line opened towards the king', () => {
  it('moving the blocker opens the long diagonal onto g2', () => {
    const fen = 'rq2k3/1b6/8/3N4/8/8/5PPP/6K1 w - - 0 20';
    const f = one(changes(fen, 'd5b4'), 'line-opened')!;
    expect(f.text).toBe('This opened the diagonal for their bishop on b7 onto g2, next to your king.');
    expect(one(changes(fen, 'd5b4', 'club'), 'line-opened')!.text).toBe('This opened the diagonal for their bishop towards your king.');
  });

  it('not when the line was already open', () => {
    expect(kinds(changes('rq2k3/1b6/8/8/8/8/5PPP/2N3K1 w - - 0 20', 'c1d3'))).not.toContain('line-opened');
  });

  it('not for a king move', () => {
    expect(kinds(changes('rq2k3/1b6/8/8/8/8/5PPP/6K1 w - - 0 20', 'g1f1'))).not.toContain('line-opened');
  });
});

describe('positionChanges: castling rights', () => {
  const FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';

  it('a king move gives up both sides', () => {
    const f = one(changes(FEN, 'e1f1', 'club'), 'castling-lost')!;
    expect(f.text).toBe('This king move gave up your right to castle.');
    expect(one(changes(FEN, 'e1f1', 'learner'), 'castling-lost')!.text).toBe('Your king can no longer castle after this.');
  });

  it('a rook move gives up one side', () => {
    expect(one(changes(FEN, 'h1g1', 'club'), 'castling-lost')!.text).toBe('This rook move gave up castling kingside (O-O).');
  });

  it('castling itself is not "lost castling rights"', () => {
    expect(kinds(changes(FEN, 'e1g1'))).not.toContain('castling-lost');
  });

  it('nothing when the right was already gone', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w Qkq - 0 5';
    expect(kinds(changes(fen, 'h1g1'))).not.toContain('castling-lost');
  });
});

describe('positionChanges: pawn structure', () => {
  it('a pawn capture off the file frees their pawn and makes yours passed', () => {
    // exf5: Black's d5-pawn has no white pawn ahead of it any more; White's f5-pawn has no black pawn ahead.
    const facts = changes('4k3/8/8/3p1n2/4P3/8/8/4K3 w - - 0 40', 'e4f5', 'analyst');
    expect(facts.map((f) => [f.kind, f.side])).toEqual([
      ['passed-pawn', 'opponent'],
      ['passed-pawn', 'own'],
    ]);
    expect(facts[0].text).toBe('This left their pawn on d5 passed.');
    expect(facts[1].text).toBe('This left your pawn on f5 passed.');
    expect(changes('4k3/8/8/3p1n2/4P3/8/8/4K3 w - - 0 40', 'e4f5', 'club')[0].text).toBe(
      'This left their d-pawn passed (none of your pawns ahead of it on its file or the files beside it).',
    );
  });

  it('a passed pawn that was already passed is not new', () => {
    // The a-pawn was passed before the h-pawn moved.
    expect(changes('4k3/8/8/8/P7/8/7P/4K3 w - - 0 40', 'h2h4')).toEqual([]);
  });

  it('a passer far back (rank 2) is not reported', () => {
    // Qxh7 takes the last black pawn in front of h2: true, but not worth a line.
    expect(kinds(changes('4k3/7p/8/8/8/8/6PP/3Q2K1 w - - 0 40', 'd1h5'))).not.toContain('passed-pawn');
    expect(kinds(changes('3qk3/7p/8/7Q/8/8/6PP/6K1 w - - 0 40', 'h5h7'))).not.toContain('passed-pawn');
  });

  it('a recapture that undoubles pawns is not "doubled pawns"', () => {
    expect(changes('4k3/8/8/8/3n4/2P5/2P5/4K3 w - - 0 30', 'c3d4')).toEqual([]);
  });

  it('a capture away from the neighbour leaves a pawn isolated', () => {
    const f = changes('4k3/8/8/8/8/2n5/PP1P4/4K3 w - - 0 30', 'b2c3', 'club');
    expect(kinds(f)).toEqual(['isolated-pawn']);
    expect(f[0].text).toBe('This left your a-pawn isolated.');
  });

  it('an isolated pawn capturing sideways is the same isolated pawn', () => {
    expect(kinds(changes('4k3/8/8/8/3n4/2P5/8/4K3 w - - 0 30', 'c3d4'))).not.toContain('isolated-pawn');
  });

  it('their pawn isolated by your capture is not reported', () => {
    // Nxd5 leaves Black's c- and e-pawns without a neighbour; that only restates the capture.
    expect(kinds(changes('4k3/2p1p3/8/3p4/8/4N3/8/4K3 w - - 0 30', 'e3d5'))).not.toContain('isolated-pawn');
  });
});

describe('positionChanges: development', () => {
  // Move 11, White's b1-knight and both bishops are still at home.
  const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 11';

  it('a quiet queen move with minor pieces at home', () => {
    const f = one(changes(FEN, 'd1e2', 'club', 21), 'development')!;
    expect(f.text).toBe('This was a queen move while three of your knights and bishops still stand on their starting squares.');
    expect(one(changes(FEN, 'd1e2', 'learner', 21), 'development')!.text).toBe('Three of your pieces are still on their starting squares.');
  });

  it('not for a developing move, nor early in the game', () => {
    expect(kinds(changes(FEN, 'b1c3', 'club', 21))).not.toContain('development');
    expect(kinds(changes(FEN, 'd1e2', 'club', 9))).not.toContain('development');
  });
});

describe('positionChanges: piece activity', () => {
  it('a knight to the rim with almost no safe squares', () => {
    const f = one(changes('4k3/5p2/6p1/8/8/5N2/6P1/4K3 w - - 0 30', 'f3h4', 'club'), 'activity')!;
    expect(f.text).toBe('Your knight has one safe square to move to from h4; it had 7 before.');
  });

  it('not when the knight keeps its squares', () => {
    expect(kinds(changes('4k3/5p2/6p1/8/8/5N2/6P1/4K3 w - - 0 30', 'f3g5'))).not.toContain('activity');
  });
});

describe('positionChanges: bishop pair', () => {
  it('a bishop for a knight that can be retaken', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
    expect(one(changes(fen, 'b5c6', 'club'), 'bishop-pair')!.text).toBe(
      'This gives a bishop for a knight: after a recapture on c6 you no longer have the bishop pair.',
    );
  });

  it('not with only one bishop', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RN1QK2R w KQkq - 0 4';
    expect(kinds(changes(fen, 'b5c6'))).not.toContain('bishop-pair');
  });
});

describe('positionChanges: styles and robustness', () => {
  const fen = 'r1bq1rk1/pppp1ppp/2n5/2b1p3/2B1P3/2NP1n2/PPP2PPP/R1BQ1RK1 w - - 0 7';

  it('learner gets one fact in plain words, club two, analyst up to three, sorted by weight', () => {
    const learner = changes(fen, 'g2f3', 'learner');
    expect(learner).toHaveLength(1);
    expect(learner[0].kind).toBe('king-shield');
    expect(learner[0].text).not.toMatch(/\b[a-h][1-8]\b/);
    expect(changes(fen, 'g2f3', 'club')).toHaveLength(2);
    const analyst = changes(fen, 'g2f3', 'analyst');
    expect(analyst.length).toBeLessThanOrEqual(3);
    expect(analyst.map((f) => f.weight)).toEqual([...analyst.map((f) => f.weight)].sort((a, b) => b - a));
  });

  it('bad or unrelated FENs give nothing', () => {
    expect(positionChanges('nonsense', fen, 'w', 13, 'club')).toEqual([]);
    expect(positionChanges(fen, 'also nonsense', 'w', 13, 'club')).toEqual([]);
    // Not one move apart.
    expect(positionChanges(fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w', 13, 'club')).toEqual([]);
    // Wrong mover.
    const after = findMove(fen, 'g2f3')!.after;
    expect(positionChanges(fen, after, 'b', 13, 'club')).toEqual([]);
  });

  it('en passant and promotion are handled', () => {
    // exd6 e.p. removes the d5-pawn: White's pawn, held by f7 on e5, is passed on d6.
    expect(one(changes('4k3/5p2/8/3pP3/8/8/8/4K3 w - d6 0 40', 'e5d6'), 'passed-pawn')!.text).toBe('This left your pawn on d6 passed.');
    expect(changes('4k3/P7/8/8/8/8/8/4K3 w - - 0 60', 'a7a8q')).toEqual([]);
  });
});
