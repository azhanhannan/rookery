// Puzzles contract. Data: the Lichess puzzle database (CC0), sampled by scripts/build-puzzles.mjs
// into public/puzzles/puzzles.json, fetched at runtime (not bundled).

export type Puzzle = {
  /** Lichess puzzle id, e.g. "00sHx". */
  id: string;
  /** Position BEFORE the opponent's first move (Lichess convention). */
  fen: string;
  /** UCI moves. moves[0] is the opponent's move that sets the puzzle up; then the solver and the
   *  opponent alternate, ending with the solver's move. */
  moves: string[];
  rating: number;
  /** Lichess theme tags, e.g. "fork", "mateIn2", "endgame". */
  themes: string[];
};

/** public/puzzles/puzzles.json */
export type PuzzleSet = {
  /** Where it came from and when, for the About page. */
  source: string;
  builtAt: string;
  puzzles: Puzzle[];
};

/** Where a puzzle attempt stands. */
export type PuzzleStatus = 'playing' | 'solved' | 'failed';
