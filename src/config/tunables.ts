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

/** Puzzles (not in the SPEC; added after Phase 5). Data from the Lichess puzzle database (CC0). */
export const PUZZLES = {
  /** scripts/build-puzzles.mjs sampling: this many puzzles per 100-point rating bucket. */
  perBucket: 120,
  minRating: 400,
  maxRating: 3000,
  /** Only well-tested puzzles: Lichess popularity (-100..100), play count and rating deviation. */
  minPopularity: 85,
  minPlays: 500,
  maxRd: 85,
  /** Next puzzle: rated within ±window of the player, widening ×2 until one is found. */
  window: 100,
  /** Don't repeat any of the last this-many puzzles. */
  recentLimit: 300,
  /** A puzzle is a fixed opponent at its rating with this RD (Glicko-2, same start as RATINGS.start). */
  puzzleRd: 75,
  /** Delay before the opponent's move is played, ms. */
  opponentDelayMs: 500,
};

/**
 * Maia matching (SPEC Feature 4, "Maia matching"): the rating whose Maia-3 model was likeliest to play the player's
 * moves. Uses RATING.minMoves / RATING.shortGameMoves for "not enough moves" and the wider range.
 */
export const MAIA_MATCH = {
  /** First pass: every position at each of these ratings. */
  coarse: [600, 1000, 1400, 1800, 2200, 2600],
  /** Second pass: the best coarse rating's neighbours at this distance (inside the model's 600-2600). */
  refineStep: 200,
  /** Probability floor for a move the model gives ~0, so one odd move can't dominate the sum. */
  minProb: 1e-6,
  /** Half-width of the shown range; a guess until calibrated (Maia self-play games came out within ~400). */
  range: 300,
  shortGameRange: 400,
};

/**
 * Human-like bots: Maia-3 (SPEC Feature 2 "Later — Maia bots"). The model predicts the move a player of a given
 * Lichess rating would play; the bot samples from that prediction. Files come from scripts/fetch-maia.mjs.
 */
export const MAIA = {
  /** Levels offered in the bot picker; the model was trained on ratings 600-2600. Also the rated-game whitelist. */
  levels: [600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600],
  /** First pick for a new viewer. */
  defaultElo: 1200,
  /**
   * Sampling: logits are divided by this before the softmax. 1 = sample the policy as-is (human-like),
   * lower = more often the top move, 0 = always the top move.
   */
  temperature: 1.0,
  /** Nucleus cut: sample only from the most likely moves that together reach this probability (1 = no cut). */
  topP: 0.95,
  /** The bot's think time, ms (the inference time counts towards it). */
  thinkMs: [800, 2500] as [number, number],
  modelUrl: '/maia/maia3_simplified.onnx',
  /** Exact sizes, for the download progress (servers may compress, so Content-Length is not used). */
  modelBytes: 45_683_686,
  /** onnxruntime-web 1.30.0 runtime, copied to public/ort by scripts/fetch-maia.mjs. */
  ortWasmUrl: '/ort/ort-wasm-simd-threaded.wasm',
  ortWasmBytes: 14_239_897,
  ortBaseUrl: '/ort/',
};

/** Practice games against a bot (unrated; takebacks and helpers). */
export const PRACTICE = {
  /** Glow on the player's hanging pieces (inset shadow on the square). */
  hangingGlow: 'rgba(230, 70, 40, 0.75)',
  /** Hanging-pieces glow for a viewer who never toggled it. */
  hangingDefaultOn: true,
  /** "Show threat" arrow (the opponent's best move if it were their turn). */
  threatArrow: 'rgba(214, 48, 32, 0.85)',
  /** "Hint" outline on the square of the piece the engine would move. */
  hintGlow: 'rgba(40, 140, 220, 0.9)',
  /** Engine search for a threat or a hint. */
  search: { depth: 12, movetime: 600 },
};

/** "My mistakes" puzzles, spaced repetition, the daily puzzle and the trained-days streak (src/puzzles/). */
export const MISTAKES = {
  /** Review labels on the player's own moves that become puzzles. */
  labels: ['Mistake', 'Blunder', 'Miss'] as string[],
  /** Spaced repetition: days until the next showing after each clean solve; solving after the last retires it. */
  intervals: [1, 3, 7, 21],
  /** Solver moves in one puzzle at most (more only along a forced mate). */
  maxSolverMoves: 3,
  /** Rest days per Monday-Sunday week that keep the streak alive (never two missed days in a row). */
  freezesPerWeek: 1,
  /** Profile line: "reviewed X of your last N games". */
  recentGames: 5,
  /** Daily puzzle: candidates rated within ±this of the player's rating (rounded to 100). */
  dailyWindow: 150,
};

/** Panel cosmetics (Settings → Play): clock warnings, animation speeds, the end-of-game celebration. */
export const POLISH = {
  /** The clock turns red below this many ms. */
  clockRedMs: 20_000,
  /** The clock shows tenths of a second below this. */
  clockTenthsMs: 10_000,
  /** A soft tick each second below this, on the player's own clock only. */
  clockTickMs: 10_000,
  /** react-chessboard move animation, ms, per Settings choice. */
  animationMs: { none: 0, fast: 80, normal: 150 },
  /** The win celebration and the rating count-up, ms (kept under 1.5 s). */
  celebrationMs: 1200,
};

/** The Analysis board (#/analysis). */
export const ANALYSIS = {
  /** Engine lines shown: the user picks 1..maxMultiPV; `multiPV` is the starting choice. */
  multiPV: 2,
  maxMultiPV: 3,
  /** 0 = analyse until stopped (`go infinite`); otherwise stop at this depth. */
  maxDepth: 0,
  /** Pause on a position before starting the engine, ms (arrow-key stepping doesn't queue searches). */
  debounceMs: 150,
  /** At most one screen update per this many ms while the engine streams lines. */
  updateMs: 150,
  /** Moves of each engine line shown in SAN. */
  pvMoves: 10,
};

/** Game Review styles (Learner / Club / Analyst), key moments and "Analyse deeper here". */
export const REVIEW_STYLE = {
  /** Default style from the player's rating: below `learnerBelow` = Learner, below `clubBelow` = Club, else Analyst. */
  learnerBelow: 1000,
  clubBelow: 1900,
  /** Key moments: the biggest win-chance swings (`loss`), at least `min` when the game has them, at most `max`. */
  keyMoments: { min: 3, max: 5, minSwing: 10 },
  /** Search depth for "Analyse deeper here". */
  deepDepth: 24,
};

/** Account sync of preferences and training state (src/sync, server/src/routes/state.ts). */
export const SYNC = {
  /** How often the app looks for changed settings in localStorage, ms. */
  pollMs: 2_000,
  /** Wait after a change before pushing it (several quick changes go up together), ms. */
  debounceMs: 1_500,
  /** Retry after a failed push or pull, ms. */
  retryMs: 30_000,
  /** Largest stored value per key (JSON characters); the server rejects bigger ones with 413. */
  maxValueBytes: 256 * 1024,
  /** Trained days kept (the streak storage keeps the same number). */
  trainedDaysLimit: 400,
};
