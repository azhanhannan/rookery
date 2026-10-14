import type { Game } from '../../generated/prisma/client';
import type { GameSummary, RatingCategory } from '../../../src/api/types';
import type { Color, GameRecord } from '../../../src/game/types';

/** What the saved games list shows for a game between two people at one screen. */
export const LOCAL_OPPONENT = 'Friend at this screen';

/** The name on the other side of the board from the account holder. */
export function opponentNameFor(record: GameRecord, userColor: Color | null): string {
  if (!userColor) return LOCAL_OPPONENT;
  return userColor === 'w' ? record.black.name : record.white.name;
}

/** Stored records were validated on upload, so reading them back as GameRecord is safe. */
export const storedRecord = (game: Game): GameRecord => game.record as unknown as GameRecord;

export function toSummary(game: Game): GameSummary {
  const record = storedRecord(game);
  return {
    clientId: game.clientId,
    white: record.white.name,
    black: record.black.name,
    result: record.result,
    termination: record.termination,
    userColor: game.userColor === 'w' || game.userColor === 'b' ? game.userColor : null,
    opponentName: game.opponentName,
    timeControl: record.timeControl,
    rated: game.rated,
    category: (game.category as RatingCategory | null) ?? null,
    moves: record.moves.length,
    hasReview: !!record.review,
    playedAt: game.playedAt.toISOString(),
  };
}
