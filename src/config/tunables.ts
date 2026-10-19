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
  /**
   * A move other than the stored best is checked with the engine and accepted when it is about as good: at most
   * `marginCp` centipawns worse than the best move, or (when the best move forces mate) a forced mate at most
   * `mateSlack` moves longer. Both positions are searched to `depth`, at most `movetimeMs` each.
   */
  alternative: { marginCp: 50, mateSlack: 2, depth: 14, movetimeMs: 800 },
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
  /** Engine lines "Analyse deeper here" shows for the position before the move. */
  deepLines: 3,
  /** Longest wait for the player's rating before deciding on the self-review question, ms (then the default style). */
  settleMs: 3000,
};

/** Endgame tablebase lookups (src/engine/tablebase.ts): Lichess's Syzygy API. */
export const TABLEBASE = {
  url: 'https://tablebase.lichess.ovh/standard',
  /** Syzygy covers up to 7 pieces, kings included. */
  maxPieces: 7,
  /** Give up on a lookup after this many ms (the caller carries on without it). */
  timeoutMs: 5000,
  /** Positions kept in the in-memory cache. */
  cacheSize: 500,
};

/** Endgame drills (#/endgames). */
export const ENDGAMES = {
  /** Stockfish's think time per defending move, ms (full strength). */
  engineMovetimeMs: 700,
  /** Without the tablebase, an engine eval at least this good for the user (centipawns) counts as a win, this bad as a loss. */
  evalWinCp: 300,
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
  maxValueBytes: 1024 * 1024,
  /** Trained days kept (the streak storage keeps the same number). */
  trainedDaysLimit: 400,
  /**
   * Delete markers (a deleted repertoire) are kept this many days, then dropped. A device that stays offline
   * longer than this can bring a deleted item back.
   */
  tombstoneDays: 90,
};

/** The opening trainer (#/openings): repertoires drilled with spaced repetition. */
export const OPENING_TRAINER = {
  /** Days until a repertoire position is asked again after each clean answer; after the last it repeats at the last. */
  intervals: [1, 3, 7, 21],
  /** "From my games": plies of each game used (20 = the first 10 moves). */
  seedPlies: 20,
  /** Pause before the board plays the opponent's repertoire move, ms. */
  opponentDelayMs: 450,
  /** Weakest positions listed in the progress view. */
  weakest: 5,
};

/** Small play helpers: the Spar button, the losing-streak cushion and premoves. */
export const QUICK = {
  /** Spar button: the rating assumed when the player's is unknown (signed out, no rated games yet). */
  sparDefaultRating: 1200,
  /** Spar button's time control, "base+increment" in seconds (10+5: a rapid game). */
  sparTimeControl: '600+5',
  /** Losses in a row against bots before Play suggests an easier bot or a few puzzles. */
  lossStreak: 3,
  /** The queued premove's two squares. */
  premoveColor: 'rgba(20, 85, 180, 0.5)',
};

/** Timed puzzles (#/puzzles → Timed): a race that never changes the puzzle rating. */
export const TIMED_PUZZLES = {
  durationMs: 3 * 60_000,
  /** Each miss takes this much off the clock. */
  missPenaltyMs: 10_000,
  /** This many misses ends the run. */
  maxMisses: 3,
  /** First puzzle's rating; each puzzle tried after that is `step` harder. */
  startRating: 600,
  step: 50,
};

/**
 * Review's friendly accuracy line (Learner and Club styles). ESTIMATE: typical game accuracy by rating band,
 * eyeballed from Lichess-formula accuracies of club players; not measured on Rookery games. Tune freely.
 */
export const ACCURACY_BANDS = {
  bands: [
    { rating: 400, accuracy: 55 },
    { rating: 600, accuracy: 62 },
    { rating: 800, accuracy: 67 },
    { rating: 1000, accuracy: 71 },
    { rating: 1200, accuracy: 75 },
    { rating: 1400, accuracy: 78 },
    { rating: 1600, accuracy: 81 },
    { rating: 1800, accuracy: 84 },
    { rating: 2000, accuracy: 87 },
    { rating: 2200, accuracy: 89 },
    { rating: 2500, accuracy: 92 },
  ],
  /** Within ± this many points of the band's typical accuracy counts as "about your level". */
  margin: 5,
};

/** Training extras: calculation mode, the name-the-square drill and the weekly training log. */
export const EXTRAS = {
  /** Calculation mode: the puzzle's pieces are shown this long, ms, then hidden. */
  calcHideMs: 5000,
  /** One name-the-square run, ms. */
  squareDrillMs: 30_000,
  /** How long a wrong click shows the right square before the next one, ms. */
  squareDrillWrongMs: 700,
  /** Training log: one activity never counts for more than this many minutes (a tab left open). */
  logMaxMinutes: { game: 90, puzzle: 10, review: 30, squares: 1, endgame: 20, opening: 20, lesson: 20 },
  /** Training log: days kept. */
  logKeepDays: 70,
};

/**
 * Opening explorer (src/explorer): Lichess masters and Lichess-games databases. Needs a Lichess personal token
 * since 2026 (the API answers 401 without one); the token stays in this browser, see src/explorer/explorer.ts.
 */
export const EXPLORER = {
  url: 'https://explorer.lichess.org',
  /** Pause on a position before asking (arrow-key stepping doesn't fire a request per move), ms. */
  debounceMs: 350,
  /** Give up on a request after this many ms. */
  timeoutMs: 8000,
  /** Answers kept in memory (per position + database + filters), least recently used dropped first. */
  cacheSize: 300,
  /** After a 429 the explorer waits this long before asking again (Lichess asks for a full minute), ms. */
  backoffMs: 60_000,
  /** Moves asked for per position. */
  moves: 12,
  /** Top master games listed (the API allows up to 15). */
  topGames: 8,
  /** Database shown first: 'masters' or 'lichess'. */
  defaultSource: 'masters' as 'masters' | 'lichess',
  /** Lichess database filters by default (rating groups start at these values; 2500 = 2500 and up). */
  defaultRatings: [1600, 1800, 2000, 2200, 2500],
  defaultSpeeds: ['blitz', 'rapid', 'classical'],
  /** Opening trainer: a repertoire move played in under this share of master games is marked rare… */
  rareShare: 0.05,
  /** …when the position has at least this many master games. */
  rareMinGames: 100,
};

/** Coach–student link (#/coach, server/src/routes/coach.ts). */
export const COACH = {
  /** How long a student's invite code works, hours. One use only; a new code replaces the old one. */
  inviteHours: 48,
  /** Invite code length (letters and digits that can't be confused: no 0/O, 1/I/L). */
  codeLength: 8,
  /** Wrong codes allowed per coach in `redeemWindowMs` before redeeming is paused (guessing protection). */
  redeemAttempts: 10,
  redeemWindowMs: 15 * 60_000,
  /** Longest comment, characters. */
  maxCommentChars: 2000,
  /** Longest homework title, characters. */
  maxTitleChars: 80,
  /** Positions per homework set. */
  maxHomeworkItems: 20,
  /** Longest solution line, plies (solver and replies; it always ends on a solver move). */
  maxSolutionPlies: 9,
  /** Student games per page in the coach's view. */
  gamesPageSize: 30,
  /** How often the header's unread-comments count refreshes while signed in, ms. */
  unreadPollMs: 60_000,
};

/** Bite-sized lessons (#/lessons): explanation screens, then practice positions. */
export const LESSONS = {
  /** Wrong tries on a practice position before "Show me" appears. */
  showAnswerAfter: 2,
  /** The idea's arrows on the explanation boards (and "Show me"). */
  arrowColor: 'rgba(21, 120, 27, 0.85)',
  /** Arrows for the opponent's threat. */
  threatColor: 'rgba(214, 48, 32, 0.85)',
  /** Squares the explanation points at. */
  highlight: 'rgba(255, 196, 0, 0.55)',
  /** The move you just played in a practice position. */
  solvedColor: 'rgba(76, 175, 80, 0.6)',
};

/**
 * Insights (#/insights, docs/insights-2026-10/synthesis.md). Win chances are percentages 0-100 from the
 * player's side; losses are win chance given away (points lost per game = loss / 100).
 */
export const INSIGHTS = {
  /**
   * Bump whenever a phase, motif or episode rule changes: cached facts are rebuilt, never migrated.
   * 2 (player profile Step 0): `MoveFact.critical` from the stored second line, and opponents split into
   * human / maia / stockfish.
   * 3 (player profile Slices 2-3): `MoveFact.forcing` (capture, check or sacrifice), for cost by type.
   */
  factsVersion: 3,
  /** Reviews shallower than this are left out (REVIEW.depth.normal). */
  minReviewDepth: 16,
  /** Games where the player made fewer moves are left out (RATING.minMoves). */
  minOwnMoves: 10,
  /** Error rates skip moves made when already lost (win chance before below this). The ledger keeps them. */
  lostBelow: 10,
  /** A move this bad or worse is an error for rates (REVIEW.loss.mistake). */
  errorLoss: 20,
  /** A motif-tagged move counts as an event at this loss or more. */
  eventLoss: 10,
  /** Time or abandon losses with win chance at least this when the game ended are clock events, not chess. */
  flagNotWorseWin: 40,
  /** …and with at least this, "lost on time while better". */
  flagBetterWin: 60,
  /** Stalemating move counts as "stalemate given away" when the mover's win chance before was at least this. */
  stalemateFromWin: 90,
  /** Conversion / save episodes: two consecutive own moves at or beyond these (+2.0 / -2.0), after this ply. */
  episode: { winAt: 67.6, loseAt: 32.4, strongWinAt: 75.2, afterPly: 10, run: 2 },
  /** Time trouble: clock before the move under max(floorMs, share of base time). */
  timeTrouble: { floorMs: 30_000, baseShare: 0.1 },
  /** Phases (simplified Lichess Divider): pieces = non-pawn, non-king pieces of both sides. */
  phase: { middlePieces: 10, backRankSparse: 3, openingMaxPly: 30, endPieces: 6, endMen: 7 },
  /** Notable moves (largest losses) kept per game as evidence positions. */
  notableMoves: 5,
  /**
   * Rushed critical moves (profile Slice 2): a critical move (only one move holds) played in less than this
   * share of the player's median time per move in that game (non-book moves with a clock reading).
   */
  rushedShare: 0.5,
  /** Forcing: a capture, a check, or a sacrifice of at least this net material (findSacrifice) that creates a threat. */
  forcingSacrifice: 1,
  /** Style lines' flip test: copies added at each tail percentile of the per-game distribution. */
  flipTest: { games: 10, lowPct: 0.05, highPct: 0.95 },
  minSample: {
    /** Page unlocks at this many qualifying reviewed games; "early read" below `earlyGames`. */
    pageGames: 10,
    earlyGames: 20,
    /** A rate card needs this many qualifying moves and events; "early read" below `earlyReadFactor` × these. */
    cardMoves: 30,
    cardEvents: 8,
    earlyReadFactor: 3,
    /** Focus: games on file, events in the bucket, and testable (decided by Hannan 18 Oct: 20 games). */
    focusGames: 20,
    focusEvents: 8,
    /** Conversion / saves card: episodes. */
    episodes: 8,
    /** Opening row: games, "early read" below `openingEarlyGames`. */
    openingGames: 10,
    openingEarlyGames: 30,
    /** Clock card: moves made in time trouble. */
    troubleMoves: 30,
    /** Long-term trend: games. */
    trendGames: 40,
    /** After-loss line: games played right after a loss. */
    afterLossGames: 15,
    /** Player profile ("Your recent games", docs/player-profile-2026-10/decision.md §5): the section opens here. */
    profileGames: 20,
    /** Profile clock line: games with a clock reading (plus `troubleMoves`). */
    clockGames: 15,
    /** Profile style lines (later slices): games per speed against people and Maia bots. */
    styleGames: 40,
  },
  /** z for 90% intervals; every interval on the page is 90%. */
  z: 1.645,
  /** Shrinkage strength, in games: estimate = (sum + k * prior) / (n + k). */
  shrinkK: 10,
  /** Testable: at the current rate, at least `events` expected in the next `games` games. */
  testable: { games: 15, events: 8 },
  /** Focus re-test (analytics §2). */
  focus: {
    /** Target rate = baseline × this. */
    targetFactor: 0.6,
    /** The window closes after at least this many new games and days. */
    minGames: 15,
    minDays: 14,
    /** "Too early" below either of these. */
    earlyGames: 5,
    earlyMoves: 150,
    /** P(rate below baseline) for "on track", and for an "improved" (or "worse") verdict. */
    onTrackP: 0.8,
    verdictP: 0.95,
    /** Prior weight on the baseline, in events (Gamma shape). Weak by design. */
    priorEvents: 2,
  },
  /** Bayesian trend: prior sd of the slope, points lost per game per game played. */
  trendPriorSd: 0.05,
};

/** Practice games: the opt-in Coach that warns, right after your move, when a rule proves it lost material or allowed mate (src/game/coachWatch.ts). */
export const COACH_PRACTICE = {
  /** Coach on for a viewer who never toggled it (Practice games only; never in Rated games). */
  defaultOn: true,
  /** Warn when your move loses at least this many pawns of material (3-ply count: their capture, your best reply)
   * more than your best other move would have. 2 = a piece for a pawn or worse; pawn drops stay quiet. */
  minLoss: 2,
};

/** Coach walkthrough in Review (src/review/coachScript.ts): Rookie walks through the key moments. */
export const COACH_WALKTHROUGH = {
  /** Most key moments the walkthrough visits (the moments themselves come from REVIEW_STYLE.keyMoments). */
  maxMoments: 5,
  /**
   * Win chance (mover's view, 0-100) to plain words: at least `winning` = winning, at least `better` = better,
   * above `worse` = about even, above `losing` = worse, else losing.
   */
  bands: { winning: 85, better: 60, worse: 40, losing: 15 },
};
