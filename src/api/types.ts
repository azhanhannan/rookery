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

// GET /api/auth/providers -> which sign-in providers are configured (the Google button hides otherwise).
export type AuthProvidersResponse = { google: boolean };
// Google sign-in is a full-page redirect, not a fetch: GET /api/auth/google?mode=login|link.
// It comes back to `/#/play` (or `/?welcome=1#/account` for a new account, `/#/account` after linking),
// or with `?authError=<message>` on `/#/login` / `/#/account`.

// GET /api/auth/account -> the signed-in player's own account details.
export type AccountResponse = {
  user: PublicUser;
  /** False for accounts made with Google: they sign in with Google only. */
  hasPassword: boolean;
  /** The linked Google account, if any (email shown for recognition only). */
  google: { email: string | null } | null;
};
// PATCH /api/auth/me { username } -> AuthResponse (same rules as sign-up; 409 when taken).
export type RenameRequest = { username: string };

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

// Puzzles. Only the FIRST attempt at each puzzle changes the puzzle rating (stored as a Rating row
// with category 'puzzle'); the server looks the puzzle's rating up itself, it never trusts the client's.
export type PuzzleRatingRow = { rating: number; rd: number; attempts: number; solved: number; provisional: boolean };
// POST /api/puzzles/:id/attempt
export type PuzzleAttemptRequest = {
  /** Solved without help. Using a hint or "show solution" counts as not solved. */
  solved: boolean;
};
export type PuzzleAttemptResponse = {
  /** False when this player had tried the puzzle before: nothing changed. */
  firstAttempt: boolean;
  /** Present on a first attempt. */
  rating?: { before: number; after: number; delta: number; provisional: boolean };
};
// GET /api/puzzles/me -> the signed-in player's puzzle rating (null before the first attempt)
// and the ids they've already tried (newest first, up to PUZZLES.recentLimit), to avoid repeats.
export type PuzzleMeResponse = { rating: PuzzleRatingRow | null; triedIds: string[] };

// GET /api/profile/:username -> public profile (no games, no PGNs).
export type ProfileResponse = {
  user: PublicUser;
  ratings: RatingRow[];
  /** Oldest first, every rated game. */
  history: RatingPoint[];
  counts: { games: number; rated: number };
  /** Puzzle rating, when the player has tried any puzzle. */
  puzzle: PuzzleRatingRow | null;
};
