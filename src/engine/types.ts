// Contract shared by the engine, the bots, the review pipeline and the UI.
// Scores are always from White's point of view (SPEC: "Scores").

export type Score = { cp: number } | { mate: number };

export type EngineLine = {
  /** 1-based MultiPV rank. */
  rank: number;
  /** First move of the line, UCI (e.g. "e2e4", "e7e8q"). */
  move: string;
  /** White's point of view. `mate` > 0 = White mates in N, < 0 = Black mates in N. */
  score: Score;
  /** Principal variation, UCI moves. */
  pv: string[];
  depth: number;
};

export type AnalysisResult = {
  fen: string;
  /** Sorted by rank; lines[0] is the engine's best line. Empty when the side to move has no legal moves. */
  lines: EngineLine[];
  depth: number;
};

export type AnalyzeOptions = { depth?: number; movetime?: number; multiPV?: number };

export type BotLevel = {
  /** Display Elo; also the id. */
  elo: number;
  mode: 'weakened' | 'limit' | 'full';
  /** Mode B only. */
  depth?: number;
  multiPV: number;
  pBest?: number;
  pBlunder?: number;
  /** Think time range in ms; the bot waits a random time inside it. */
  thinkMs: [number, number];
};

export interface Engine {
  init(): Promise<void>;
  analyze(fen: string, opts: AnalyzeOptions): Promise<AnalysisResult>;
  /** Raw `setoption name X value Y`. */
  setOption(name: string, value: string | number | boolean): Promise<void>;
  /** Plays at the engine's built-in strength limit: `go movetime`. Returns a UCI move. */
  goMovetime(fen: string, movetimeMs: number): Promise<string>;
  /** `UCI_Elo` range reported by the engine's `uci` output. */
  eloRange(): { min: number; max: number } | null;
  stop(): void;
  newGame(): Promise<void>;
  terminate(): void;
}
