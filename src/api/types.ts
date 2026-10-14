// Phase 5 contract: the JSON the server (server/src) and the browser (src/api/client.ts) exchange.
// All routes live under /api. Errors are { error: string } with a 4xx/5xx status; the string is
// written for the player to read.
import type { Color, GameRecord, GameResult } from '../game/types';

export type RatingCategory = 'bullet' | 'blitz' | 'rapid' | 'classical';

export type PublicUser = { id: string; username: string; createdAt: string };

export type ApiError = { error: string };

// POST /api/auth/signup and POST /api/auth/login. Both set the session cookie.
export type AuthRequest = { username: string; password: string };
export type AuthResponse = { user: PublicUser };
// GET /api/auth/me -> AuthResponse, or 401 when signed out. POST /api/auth/logout -> 204.

export type RatingRow = {
  category: RatingCategory;
  /** Rounded for display. */
  rating: number;
  rd: number;
  games: number;
  /** True while RD is above RATINGS.provisionalRd: shown as "1500?". */
  provisional: boolean;
};

export type RatingChange = {
  category: RatingCategory;
  before: number;
  after: number;
  /** after - before, rounded. */
  delta: number;
  provisional: boolean;
};

// PUT /api/games/:clientId  (clientId = GameRecord.id). Idempotent: re-uploading the same game
// (e.g. after its review finishes) replaces the stored record but never re-applies the rating.
export type SaveGameRequest = {
  record: GameRecord;
  /** Side the signed-in player played; null for a game between two people at one screen. */
  userColor: Color | null;
  /** The player asked for a rated game. The server still checks the game qualifies (ratingIneligibleReason). */
  rated: boolean;
};

export type GameSummary = {
  clientId: string;
  white: string;
  black: string;
  result: GameResult;
  termination?: string;
  userColor: Color | null;
  opponentName: string;
  timeControl?: string;
  rated: boolean;
  category: RatingCategory | null;
  moves: number;
  hasReview: boolean;
  playedAt: string;
};

export type SaveGameResponse = {
  game: GameSummary;
  /** Present only on the upload that applied the rating. */
  rating?: RatingChange;
  /** Asked for rated but not rated: why (e.g. "Untimed games are not rated"). */
  unratedReason?: string;
};

// GET /api/games?before=<ISO playedAt> -> newest first, RATINGS.pageSize per page.
export type GameListResponse = { games: GameSummary[]; nextBefore: string | null };

// GET /api/games/:clientId -> the stored record (own games only; 404 otherwise).
export type GameResponse = { game: GameSummary; record: GameRecord };

export type RatingPoint = { category: RatingCategory; rating: number; at: string; gameClientId: string };

// GET /api/profile/:username -> public profile (no games, no PGNs).
export type ProfileResponse = {
  user: PublicUser;
  ratings: RatingRow[];
  /** Oldest first, every rated game. */
  history: RatingPoint[];
  counts: { games: number; rated: number };
};
