// Every tunable number in the spec lives here (review thresholds arrive in Phase 3).
import type { BotLevel } from '../engine/types';

/** Working name; the spec requires an original name, so change it here when one is chosen. */
export const APP_NAME = 'Rookery';

/** Stockfish build served from public/stockfish (lite, single-threaded: needs no COOP/COEP headers). */
export const ENGINE_URL = '/stockfish/stockfish-19-lite-single.js';

/**
 * Bot levels (SPEC Feature 2, all tunable).
 * - weakened: Mode B, custom weakening below Stockfish's UCI_Elo floor.
 * - limit:    Mode A, UCI_LimitStrength + UCI_Elo, `go movetime`.
 * - full:     no limit.
 */
export const BOT_LEVELS: BotLevel[] = [
  { elo: 400, mode: 'weakened', depth: 1, multiPV: 5, pBest: 0.3, pBlunder: 0.25, thinkMs: [500, 1500] },
  { elo: 600, mode: 'weakened', depth: 2, multiPV: 5, pBest: 0.4, pBlunder: 0.15, thinkMs: [500, 1500] },
  { elo: 800, mode: 'weakened', depth: 3, multiPV: 4, pBest: 0.5, pBlunder: 0.1, thinkMs: [800, 2000] },
  { elo: 1000, mode: 'weakened', depth: 4, multiPV: 4, pBest: 0.6, pBlunder: 0.06, thinkMs: [800, 2000] },
  { elo: 1200, mode: 'weakened', depth: 5, multiPV: 3, pBest: 0.7, pBlunder: 0.03, thinkMs: [1000, 2500] },
  ...[1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000].map(
    (elo): BotLevel => ({ elo, mode: 'limit', multiPV: 1, thinkMs: [1000, 3000] }),
  ),
  { elo: 3200, mode: 'full', multiPV: 1, thinkMs: [2000, 2000] },
];

/** Label for the full-strength level. */
export const MAX_LEVEL_LABEL = 'Max';

/** "I don't know my level" starts here. */
export const DEFAULT_BOT_ELO = 800;

/** Bots at this level and above never skip a mate-in-1 when weakening. */
export const NO_MISSED_MATE_FROM_ELO = 800;

/** Live eval bar during play. */
export const LIVE_EVAL = { depth: 12, movetime: 400 };

/** Game Review (SPEC Feature 3). Win chances are percentages 0-100 from the mover's side. */
export const REVIEW = {
  depth: { fast: 12, normal: 16, deep: 20 },
  multiPV: 2,
  /** Engine hash table for reviews, MB (Stockfish default 16). Consecutive positions share entries. */
  hashMb: 64,
  /** Upper `loss` bound for each label, checked in this order. Above `mistake` = Blunder. */
  loss: { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 },
  /** Great: top move, second-best line at least this much worse, mover not already above `greatMaxWinBefore`. */
  greatGap: 15,
  greatMaxWinBefore: 95,
  /** Miss: opponent's previous move gave at least `missGift`, and this move gives back at least `missGiveBack`. */
  missGift: 10,
  missGiveBack: 10,
  brilliant: {
    maxLoss: 2,
    /** Net material the sacrifice can lose, in pawns (P1 N3 B3 R5 Q9). */
    minSacrifice: 2,
    maxWinBefore: 90,
    /**
     * Not in the SPEC: a mover already below this has nothing to sacrifice for, and the engine's
     * "best" move there is often a desperado that only looks like a sacrifice.
     */
    minWinBefore: 5,
  },
};

/** Estimated game rating (SPEC Feature 4, MVP method). */
export const RATING = {
  /** Fewer moves than this by a player: no estimate. */
  minMoves: 10,
  /** Fewer moves than this: the wider range. */
  shortGameMoves: 20,
  /** Half-width of the shown range. Replaced by the calibration's typical error once calibrated. */
  range: 200,
  shortGameRange: 300,
  /** Blunders up to this many are free; each one beyond costs `blunderPenalty`. */
  freeBlunders: 2,
  blunderPenalty: 100,
  /** Lowest rating ever shown. */
  floor: 100,
};

/**
 * Accounts and player ratings (SPEC Feature 5). Glicko-2, one rating per time-control category.
 * The three "rules to decide before building" are answered here so they can be changed:
 */
export const RATINGS = {
  /** Rule 1: games against bots change the rating (the only rated games until online play exists). */
  botGamesRated: true,
  /** Rule 2: separate ratings per category. Estimated duration = base + 40 x increment, in seconds (Lichess's formula). */
  categories: [
    { id: 'bullet', maxSeconds: 179 },
    { id: 'blitz', maxSeconds: 479 },
    { id: 'rapid', maxSeconds: 1499 },
    { id: 'classical', maxSeconds: Infinity },
  ] as const,
  /** Untimed games have no category, so they are saved but never rated. */
  rateUntimed: false,
  /** Rule 3: everyone starts at 1500 / 350 / 0.06 (SPEC); first bot games do not seed the rating. */
  start: { rating: 1500, rd: 350, volatility: 0.06 },
  /** Glicko-2 system constant (how fast volatility can change); 0.3-1.2 is usual. */
  tau: 0.5,
  /** A bot counts as a fixed opponent at its level's Elo with this RD; bots' ratings never move. */
  botRd: 50,
  /** Shown as provisional ("1500?") while RD is above this. */
  provisionalRd: 110,
  /** Fewer full moves than this: the game is saved but not rated (stops instant-resign farming). */
  minMovesToRate: 2,
  /** Games per page in the saved games list. */
  pageSize: 30,
  /** Accounts. */
  usernamePattern: /^[A-Za-z0-9_-]{3,20}$/,
  minPasswordLength: 8,
  sessionDays: 30,
  /** Failed logins allowed per username+IP per window before 429. */
  loginAttempts: { max: 10, windowMs: 15 * 60_000 },
};
