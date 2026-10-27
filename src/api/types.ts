// Phase 5 contract: the JSON the server (server/src) and the browser (src/api/client.ts) exchange.
// All routes live under /api. Errors are { error: string } with a 4xx/5xx status; the string is
// written for the player to read.
import type { Color, GameRecord, GameResult } from '../game/types';
import type { PlayerProfile } from '../insights/profile';
import type { BucketId, Coverage, GameFacts, HistoryEntry, InsightsModel, Motif, Phase, Trend } from '../insights/types';

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
  /** Plies (half-moves). */
  moves: number;
  hasReview: boolean;
  playedAt: string;
  /** The final position, for the list's thumbnail. */
  finalFen: string;
  /** Rating change this game applied (rounded); absent for unrated games. */
  ratingDelta?: number;
};

/** My games filter chips. Won/lost/drawn are from the account holder's side. */
export type GameFilter = 'all' | 'won' | 'lost' | 'drawn' | 'rated' | 'casual';
export const GAME_FILTERS: GameFilter[] = ['all', 'won', 'lost', 'drawn', 'rated', 'casual'];

/** Counts over all the account's games (not one page, not the filter). Won/lost/drawn only count games with a side. */
export type GameStats = { total: number; won: number; lost: number; drawn: number };

export type SaveGameResponse = {
  game: GameSummary;
  /** Present only on the upload that applied the rating. */
  rating?: RatingChange;
  /** Asked for rated but not rated: why (e.g. "Untimed games are not rated"). */
  unratedReason?: string;
};

// GET /api/games?before=<ISO playedAt> -> newest first, RATINGS.pageSize per page.
// GET /api/games?filter=<GameFilter>&before=<iso>. `stats` comes with the first page only.
export type GameListResponse = { games: GameSummary[]; nextBefore: string | null; stats?: GameStats };

// GET /api/games/ids -> every saved game's clientId (to tell which games on this device aren't uploaded yet).
export type GameIdsResponse = { clientIds: string[] };

// GET /api/games/:clientId -> the stored record (own games only; 404 otherwise).
export type GameResponse = { game: GameSummary; record: GameRecord };

export type RatingPoint = {
  category: RatingCategory;
  rating: number;
  at: string;
  gameClientId: string;
  /** The rating was still provisional after this game (RD above RATINGS.provisionalRd). */
  provisional: boolean;
};

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

// Account state: preferences and training state kept on the account so every device matches
// (src/sync). Keys are the localStorage keys listed in src/sync/keys.ts (an allowlist); a value is
// the raw localStorage string (null = not set) for a preference, or parsed JSON for the training keys.
// `updatedAt` is ms since the epoch when the value last changed (the server caps it at its own clock).
export type StateItem = { value: unknown; updatedAt: number };
// GET /api/state -> everything stored for the signed-in player.
export type StateResponse = { items: Record<string, StateItem> };
// PUT /api/state -> merges each item with what is stored (preferences: newest wins; training state:
// per-item merge) and answers with everything stored afterwards. 400 for an unknown key or a bad value,
// 413 when a value is over SYNC.maxValueBytes.
export type StatePutRequest = { items: Record<string, StateItem> };

// Coach–student link (server/src/routes/coach.ts). A student makes a one-use invite code; a coach
// redeems it. While linked, the coach can read the student's saved games (with reviews), ratings and
// homework progress, comment on games and set puzzle homework. Either side can unlink; every coach
// route checks the link first and answers 404 (not 403) for anyone else, so it never says who exists.
export type CoachUser = { id: string; username: string };

// POST /api/coach/invite -> a new code for the signed-in student (replaces their unused ones).
export type CoachInviteResponse = { code: string; expiresAt: string };
// POST /api/coach/redeem { code } -> links the signed-in player as the code owner's coach.
// 404 unknown, 410 expired or already used, 400 own code, 429 too many wrong codes.
export type CoachRedeemRequest = { code: string };
export type CoachRedeemResponse = { student: CoachUser };

// GET /api/coach/links -> both sides of the signed-in player's links.
export type CoachLinksResponse = {
  coaches: (CoachUser & { since: string })[];
  students: (CoachUser & { since: string })[];
};
// DELETE /api/coach/coaches/:coachId (student unlinks) and DELETE /api/coach/students/:studentId
// (coach unlinks) -> 204; 404 when there was no link.

export type CoachStudentRow = CoachUser & {
  since: string;
  /** Game ratings, rounded (bullet..classical), plus the puzzle rating when there is one. */
  ratings: { category: RatingCategory | 'puzzle'; rating: number; provisional: boolean }[];
  /** Latest of: a saved game, a puzzle or homework attempt, a sign-in. Null when none. */
  lastActive: string | null;
  games: number;
  /** Homework sets not finished yet. */
  openHomework: number;
};
// GET /api/coach/students -> the signed-in coach's students.
export type CoachStudentsResponse = { students: CoachStudentRow[] };

export type CoachGameSummary = GameSummary & {
  /** The student's accuracy in the stored review; null without a review or a side. */
  accuracy: number | null;
  comments: number;
};
// GET /api/coach/students/:studentId/games?before=<iso> -> newest first, COACH.gamesPageSize per page.
export type CoachGamesResponse = { student: CoachUser; games: CoachGameSummary[]; nextBefore: string | null };

export type CoachComment = {
  id: string;
  coach: CoachUser;
  /** 1-based ply; null = the whole game. */
  ply: number | null;
  body: string;
  createdAt: string;
  /** Null while the student hasn't seen it. */
  readAt: string | null;
};
// GET /api/coach/students/:studentId/games/:clientId -> the record and this coach's comments on it
// (a student's coaches don't see each other's comments; the student sees them all).
export type CoachGameResponse = { student: CoachUser; game: GameSummary; record: GameRecord; comments: CoachComment[] };
// POST /api/coach/students/:studentId/games/:clientId/comments -> 201 { comment }.
export type CoachCommentRequest = { body: string; ply?: number | null };
export type CoachCommentResponse = { comment: CoachComment };

// Student side. GET /api/coach/comments/unread -> the unread count, and every own game that has coach
// comments (newest comment first) with its total and unread counts.
export type CoachCommentedGame = { clientId: string; total: number; unread: number; latestAt: string };
export type CoachUnreadResponse = { count: number; games: CoachCommentedGame[] };
// GET /api/coach/comments/:clientId -> comments on one of the student's own games (marks nothing read).
export type CoachGameCommentsResponse = { comments: CoachComment[] };
// POST /api/coach/comments/:clientId/read -> 204; marks that game's comments read.

/** One homework position: the solver is to move in `fen`; `solution` is UCI, solver first, ending on a solver move. */
export type HomeworkItem = {
  fen: string;
  solution: string[];
  /** Where it came from in the student's games, when it did. */
  source?: { gameClientId: string; ply: number };
  note?: string;
};
export type HomeworkItemProgress = { attempts: number; solved: boolean };
export type Homework = {
  id: string;
  coach: CoachUser;
  student: CoachUser;
  title: string;
  items: HomeworkItem[];
  dueAt: string | null;
  createdAt: string;
  /** Index-aligned with items. */
  progress: HomeworkItemProgress[];
  /** Every item solved at least once. */
  done: boolean;
};
// POST /api/coach/students/:studentId/homework -> 201 { homework }. 400 with the reason for a bad position.
export type HomeworkCreateRequest = { title: string; items: HomeworkItem[]; dueAt?: string | null };
export type HomeworkResponse = { homework: Homework };
// GET /api/coach/students/:studentId/homework (coach) and GET /api/coach/homework (student: from current coaches).
export type HomeworkListResponse = { homework: Homework[] };
// DELETE /api/coach/homework/:id -> 204 (the coach who set it, while still linked).
// POST /api/coach/homework/:id/attempt { item, solved } -> the updated homework (the student only).
export type HomeworkAttemptRequest = { item: number; solved: boolean };

// Insights (server/src/routes/insights.ts; pure logic in src/insights). The server keeps one facts record
// per saved game (GameInsight), rebuilt when INSIGHTS.factsVersion changes, so the numbers cover the
// account's whole history and a linked coach can read them. The browser app works without any of this.

/** A coach's override of the student's Focus: it outranks the student's own pick. */
export type CoachFocusInfo = {
  /** A ledger bucket id, e.g. 'E:hanging', 'M:fork', 'time-trouble', 'conversion' (never an 'other' cell). */
  bucketId: BucketId;
  note: string | null;
  coach: CoachUser;
  /** When the coach set it: the re-test counts games after this. */
  createdAt: string;
};

// GET /api/insights/facts -> the signed-in player's facts for every saved game (not just the ones on this
// device), what was left out and why, every finished game in order (for "the game after a loss"), and
// whether any coach is linked (the page then says "Your coach can see this").
export type InsightsFactsResponse = {
  factsVersion: number;
  facts: GameFacts[];
  coverage: Coverage;
  history: HistoryEntry[];
  coachLinked: boolean;
};
// GET /api/insights/coach-focus -> the active coach Focus (from a currently linked coach), or null.
export type CoachFocusResponse = { focus: CoachFocusInfo | null };

/** One deciding position for the coach: the position before the student's move, and the engine's answer. */
export type CoachEvidence = {
  clientId: string;
  /** 1-based ply of the student's move (CoachComment.ply takes it as is). */
  ply: number;
  /** Win chance given away, 0-100. */
  loss: number;
  /** Position before the move; the student is to move. */
  fen: string;
  san: string;
  bestSan?: string;
  motif: Motif;
  phase: Phase;
  opponentName: string;
  playedAt: string;
  color: Color;
  /** The position as a homework item (engine solution, source set); null when there's no usable line. */
  homework: HomeworkItem | null;
};

// GET /api/coach/students/:studentId/insights -> 404 without an active link. The student's Insights at Analyst
// detail over all their saved games, the evidence positions of every shown bucket (plus the Focus and the
// coach Focus), long-term trends per bucket once there are INSIGHTS.minSample.trendGames games (else empty),
// and the active coach Focus. Rating-band comparisons are not offered (they wait on Phase 4 calibration).
export type CoachInsightsResponse = {
  student: CoachUser;
  insights: InsightsModel;
  evidence: Partial<Record<BucketId, CoachEvidence[]>>;
  trends: Trend[];
  focus: CoachFocusInfo | null;
  /**
   * "Your recent games" as the student sees it (src/insights/profile.ts over the same model), pointing at the
   * coach Focus when one is set. Coaches only: the public profile never carries it.
   */
  profile: PlayerProfile;
};
// PUT /api/coach/students/:studentId/focus { bucketId, note? } -> { focus } (replaces any active one, from any coach).
// 400 for an unknown or 'other' bucket. DELETE /api/coach/students/:studentId/focus -> 204; 404 unless this coach set it.
// Homework from an insight goes through POST /api/coach/students/:studentId/homework with CoachEvidence.homework items.
export type CoachFocusRequest = { bucketId: BucketId; note?: string | null };
