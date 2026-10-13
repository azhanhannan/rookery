// Fixed positions with known labels (SPEC "Testing approach"), checked against the real engine.
// Each one is picked so the label is not a judgement call: the margins are far from every threshold.
import type { MoveLabel } from '../../src/review/types';

export type ReviewFixture = {
  name: string;
  /** Why the expected label is unambiguous. */
  why: string;
  startFen: string;
  /** UCI moves played from `startFen`. */
  moves: string[];
  bookPlies?: number;
  /** Expected label per ply; a list accepts any of them; null = not checked. */
  expected: (MoveLabel | MoveLabel[] | null)[];
};

export const REVIEW_FIXTURES: ReviewFixture[] = [
  {
    name: 'Blunder: Black allows Scholar\'s mate',
    why: '1.e4 e5 2.Qh5 Nc6 3.Bc4, and 3...Nf6?? walks into Qxf7#: Black goes from about equal to mated (loss ~50).',
    startFen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
    moves: ['g8f6'],
    expected: ['Blunder'],
  },
  {
    name: 'Mistake: 1...g5',
    why: '1.e4 g5?! weakens the king side for nothing: about +2 for White, a loss of ~15 win%, mid-way between the Mistake bounds (10, 20).',
    startFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    moves: ['g7g5'],
    expected: ['Mistake'],
  },
  {
    name: 'Inaccuracy: clinging to the gambit pawn',
    why: '1.d4 d5 2.c4 dxc4 3.e3 b5?! holds the pawn at the cost of the queen side: a loss of ~7 win%, inside the Inaccuracy band (5, 10].',
    startFen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/4P3/PP3PPP/RNBQKBNR b KQkq - 0 3',
    moves: ['b7b5'],
    expected: ['Inaccuracy'],
  },
  {
    name: 'Best: mate in one when already winning',
    why: 'Qf8# is the engine\'s top move; White is at 100% so the Great rule (needs <= 95%) and Brilliant (< 90%) cannot apply.',
    startFen: '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1',
    moves: ['f1f8'],
    expected: ['Best'],
  },
  {
    name: 'Great: the only recapture',
    why: 'White has just taken the queen on d8. Rxd8 leaves an equal rook ending; every other move is a queen down, so line 2 is ~50 win% worse.',
    startFen: 'r2Q4/p4ppk/7p/8/8/8/P4PPP/R5K1 b - - 0 1',
    moves: ['a8d8'],
    expected: ['Great'],
  },
  {
    name: 'Book: 1.e4',
    why: 'Book is decided by the openings data, not the engine: ply 1 is inside bookPlies.',
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: ['e2e4'],
    bookPlies: 1,
    expected: ['Book'],
  },
  {
    name: 'Brilliant: Legal\'s sacrifice of the queen',
    why: '1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6? 5.Nxe5! unpins and leaves the queen to Bxd1, which loses to Bxf7+ and Nd5#. Best move, White better but not winning outright, queen en prise by SEE.',
    startFen: 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5',
    moves: ['f3e5'],
    expected: ['Brilliant'],
  },
  {
    name: 'Miss: the queen is left alive',
    why: '1.e4 e5 2.Nf3 Qh4?? hangs the queen to Nxh4 (Blunder, a gift of ~45 win%); 3.Nc3?? lets it escape and gives the gift straight back.',
    startFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    moves: ['d8h4', 'b1c3'],
    expected: ['Blunder', 'Miss'],
  },
];
