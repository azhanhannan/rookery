import type { MaiaMatch } from '../rating/maiaMatch';
import type { GameReview } from '../review/types';

export type { GameReview };

export type Color = 'w' | 'b';

export type PlayerInfo = {
  name: string;
  isBot: boolean;
  elo?: number;
  /** Which program plays a bot side. Absent = 'stockfish' (games saved before Maia have no field). */
  engine?: BotEngine;
};

/** 'stockfish' = the engine bot (BOT_LEVELS), 'maia' = the human-like bot (MAIA.levels). */
export type BotEngine = 'stockfish' | 'maia';

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
  /** Rating estimated from playing style (Maia matching); independent of the Stockfish review. */
  maiaMatch?: MaiaMatch;
  /** The player asked for a rated game when starting it (Phase 5). The server decides whether it qualifies. */
  rated?: boolean;
  /** Practice game against a bot: never rated, takebacks and helpers allowed. Absent = not practice (older games). */
  practice?: boolean;
};

export type SideChoice = 'w' | 'b' | 'random';

export type Opponent = 'friend' | 'bot';

/** What the New game dialog chose; kept so "Play again" can repeat it. */
export type NewGameOptions = {
  side: SideChoice;
  timeControlId: string;
  /** Default 'friend'. */
  opponent?: Opponent;
  /** Bot level (BOT_LEVELS elo); only used when opponent is 'bot'. */
  botElo?: number;
  /** Phase 5: start the game as rated (only offered when signed in, against a bot, with a clock). */
  rated?: boolean;
  /** Bot style; absent = 'stockfish'. With 'maia', botElo is a MAIA.levels level. */
  botEngine?: BotEngine;
  /** Practice game (bot only): unrated, with takebacks and helpers. Wins over `rated`. */
  practice?: boolean;
};
