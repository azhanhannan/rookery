// Glicko-2 for player ratings (SPEC Feature 5). Pure: used by the server, testable without it.
// The math is the `glicko2` package's; this file only decides what is rated and feeds it one game at a time.
import { Glicko2 } from 'glicko2';
import { BOT_LEVELS, RATINGS } from '../config/tunables';
import type { RatingCategory } from '../api/types';
import type { Color, GameRecord } from '../game/types';
import { START_FEN } from '../game/rules';

export type GlickoState = { rating: number; rd: number; volatility: number };

export function initialRating(): GlickoState {
  return { ...RATINGS.start };
}

/** Seconds of [base, increment] for a "base+inc" time control, or null when absent or malformed. */
function parseTimeControl(timeControl: string | undefined): [number, number] | null {
  const m = timeControl ? /^(\d{1,6})\+(\d{1,4})$/.exec(timeControl) : null;
  if (!m) return null;
  const base = Number(m[1]);
  const inc = Number(m[2]);
  return base + inc > 0 ? [base, inc] : null;
}

const isUntimed = (timeControl: string | undefined) => timeControl === undefined || timeControl === 'unlimited';

/** Category for a "base+inc" time control in seconds (GameRecord.timeControl), or null when untimed/unknown. */
export function categoryFor(timeControl: string | undefined): RatingCategory | null {
  const tc = parseTimeControl(timeControl);
  if (!tc) return null;
  const seconds = tc[0] + 40 * tc[1];
  return RATINGS.categories.find((c) => seconds <= c.maxSeconds)?.id ?? null;
}

/**
 * The category a rated game counts in. Same as categoryFor, except that untimed games go under
 * 'classical' if RATINGS.rateUntimed is ever switched on (they have no category of their own).
 */
export function ratedCategoryFor(timeControl: string | undefined): RatingCategory | null {
  const category = categoryFor(timeControl);
  if (category) return category;
  return RATINGS.rateUntimed && isUntimed(timeControl) ? 'classical' : null;
}

/** Placement, side to move, castling and en passant: a start position with other move counters is still standard. */
const fenKey = (fen: string) => fen.trim().split(/\s+/).slice(0, 4).join(' ');

/** Why `record` can't be rated for the player on `userColor`, or null when it can. Player-readable. */
export function ratingIneligibleReason(record: GameRecord, userColor: Color | null): string | null {
  if (!userColor) return 'Games between two people at one screen are not rated';
  if (!RATINGS.botGamesRated) return 'Games against bots are not rated';
  const user = userColor === 'w' ? record.white : record.black;
  const opponent = userColor === 'w' ? record.black : record.white;
  if (!opponent.isBot) return 'Only games against a bot are rated for now';
  if (opponent.elo === undefined || !BOT_LEVELS.some((l) => l.elo === opponent.elo))
    return 'Games against an unknown bot level are not rated';
  if (user.isBot) return "Your side was played by a bot, so it can't be rated";
  if (fenKey(record.startFen) !== fenKey(START_FEN)) return 'Games from a custom position are not rated';
  if (record.result === '*') return 'Unfinished games are not rated';
  if (!ratedCategoryFor(record.timeControl))
    return isUntimed(record.timeControl) ? 'Untimed games are not rated' : 'Games with an unknown time control are not rated';
  // Standard start position, so White made the even plies.
  const userMoves = userColor === 'w' ? Math.ceil(record.moves.length / 2) : Math.floor(record.moves.length / 2);
  if (userMoves < RATINGS.minMovesToRate)
    return `Games where you made fewer than ${RATINGS.minMovesToRate} moves are not rated`;
  return null;
}

/** Score for `userColor` from a finished result: 1, 0.5 or 0. */
export function scoreFor(result: GameRecord['result'], userColor: Color): number {
  if (result === '*') throw new Error('scoreFor needs a finished result');
  if (result === '1/2-1/2') return 0.5;
  return (result === '1-0') === (userColor === 'w') ? 1 : 0;
}

/** The player's new state after one game against a fixed-rating opponent (one game = one rating period). */
export function rateGame(player: GlickoState, opponent: { rating: number; rd: number }, score: number): GlickoState {
  const system = new Glicko2({
    tau: RATINGS.tau,
    rating: RATINGS.start.rating,
    rd: RATINGS.start.rd,
    vol: RATINGS.start.volatility,
  });
  const me = system.makePlayer(player.rating, player.rd, player.volatility);
  // The opponent is updated too by the library; its new values are simply thrown away.
  const them = system.makePlayer(opponent.rating, opponent.rd, RATINGS.start.volatility);
  system.updateRatings([[me, them, score]]);
  return { rating: me.getRating(), rd: me.getRd(), volatility: me.getVol() };
}

export function isProvisional(rd: number): boolean {
  return rd > RATINGS.provisionalRd;
}
