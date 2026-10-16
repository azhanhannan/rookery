// "From my games" (pure): the Openings report rows for one side, each with the games behind it as seed lines.
import { openingsReport, type OpeningRow } from '../account/openingsReport';
import type { Color, GameRecord } from '../game/types';
import type { SeedGame } from './repertoire';

export type SeedRow = { row: OpeningRow; games: SeedGame[] };

/** The user's openings as `color` (most played first), with each opening's games as seed lines. */
export function seedRows(records: GameRecord[], names: Map<string, string | null>, color: Color): SeedRow[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  return openingsReport(records.map((record) => ({ record, opening: names.get(record.id) })))
    .filter((row) => row.color === color)
    .map((row) => ({
      row,
      games: row.gameIds.flatMap((id) => {
        const r = byId.get(id);
        return r ? [{ startFen: r.startFen, ucis: r.moves.map((m) => m.uci) }] : [];
      }),
    }));
}
