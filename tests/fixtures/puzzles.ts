// Real puzzles copied from public/puzzles/puzzles.json (Lichess puzzle database, CC0), picked for what they exercise.
import type { Puzzle } from '../../src/puzzles/types';

/** Mate in 1, solver Black: g5g2#. */
export const MATE_IN_1: Puzzle = {
  id: 'UGlI7',
  fen: 'r3k1nr/ppp2ppp/8/3pP1q1/2P1p3/2P1P2b/P3BPPP/R1BQ1RK1 w kq - 5 11',
  moves: ['f2f4', 'g5g2'],
  rating: 406,
  themes: ['kingsideAttack', 'mate', 'mateIn1', 'middlegame', 'oneMove'],
};

/** Mate in 1, solver White: e4h7#. */
export const MATE_IN_1_WHITE: Puzzle = {
  id: '9jlec',
  fen: '2r1rbk1/4nppp/3p4/qp1Pp3/p3Q1P1/2PBBP2/PP5P/2KR3R b - - 1 21',
  moves: ['b5b4', 'e4h7'],
  rating: 418,
  themes: ['kingsideAttack', 'mate', 'mateIn1', 'middlegame', 'oneMove'],
};

/** Mate in 2, solver Black. The final d1e1# has an alternative mate: e8e1#. */
export const MATE_IN_2_ALT: Puzzle = {
  id: '70imS',
  fen: '2k1r3/p2q1p2/1pp3p1/7p/2P5/Q3n2P/PP3PP1/4RK2 w - - 0 29',
  moves: ['e1e3', 'd7d1', 'e3e1', 'd1e1'],
  rating: 621,
  themes: ['endgame', 'mate', 'mateIn2', 'short'],
};

/** Pawn race, solver Black, ends by promoting: f2f1q. */
export const PROMOTION: Puzzle = {
  id: 'oZH5X',
  fen: '8/8/7k/5p1P/K7/8/1P6/8 w - - 0 47',
  moves: ['b2b4', 'f5f4', 'a4a5', 'f4f3', 'b4b5', 'f3f2', 'b5b6', 'f2f1q'],
  rating: 628,
  themes: ['advancedPawn', 'crushing', 'endgame', 'pawnEndgame', 'promotion', 'quietMove', 'veryLong'],
};

/** Twelve moves (six by the solver, White), ending in g7g8q. */
export const LONG: Puzzle = {
  id: 'VkE62',
  fen: '8/2p5/8/2pr4/2k5/2P2RPK/8/8 b - - 4 62',
  moves: ['d5d3', 'f3d3', 'c4d3', 'g3g4', 'd3c3', 'g4g5', 'c3b2', 'g5g6', 'c5c4', 'g6g7', 'c4c3', 'g7g8q'],
  rating: 1324,
  themes: ['advancedPawn', 'crushing', 'endgame', 'promotion', 'quietMove', 'rookEndgame', 'veryLong'],
};

/** Fork, solver Black, no mate. */
export const FORK: Puzzle = {
  id: 'g3HjF',
  fen: '6r1/pk1r3p/3b4/8/PpR5/1P1Pn3/1BPN2PP/R5K1 w - - 10 29',
  moves: ['c4h4', 'g8g2', 'g1h1', 'g2d2'],
  rating: 1410,
  themes: ['crushing', 'fork', 'middlegame', 'short'],
};

/** Mate in 3, solver Black. */
export const MATE_IN_3: Puzzle = {
  id: 'aTwzT',
  fen: '6k1/1p5p/2pp2p1/P2Pb1P1/2P3bP/P1pn2K1/Q3Br2/R6R w - - 5 30',
  moves: ['g3g4', 'f2g2', 'g4f3', 'g2g3', 'f3e4', 'd3c5'],
  rating: 2006,
  themes: ['long', 'master', 'masterVsMaster', 'mate', 'mateIn3', 'middlegame'],
};

export const ALL_PUZZLES: Puzzle[] = [MATE_IN_1, MATE_IN_1_WHITE, MATE_IN_2_ALT, PROMOTION, LONG, FORK, MATE_IN_3];
