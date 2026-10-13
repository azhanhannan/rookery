// Feature 3 fills this in; kept opaque until Game Review exists.
export type GameReview = Record<string, unknown>;

export type Color = 'w' | 'b';

export type PlayerInfo = { name: string; isBot: boolean; elo?: number };

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export type MoveRecord = {
  san: string;
  uci: string;
  fenAfter: string;
  /** Mover's remaining clock after the move (increment included). */
  clockMs?: number;
};

export type GameRecord = {
  id: string;
  startFen: string;
  moves: MoveRecord[];
  white: PlayerInfo;
  black: PlayerInfo;
  result: GameResult;
  termination?: string;
  createdAt: string;
  /** Time control as "base+increment" in seconds, e.g. "180+2". Absent = unlimited. */
  timeControl?: string;
  review?: GameReview;
};
