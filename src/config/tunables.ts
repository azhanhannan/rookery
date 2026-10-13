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
