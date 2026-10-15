import { describe, expect, it } from 'vitest';
import {
  firstWrongMove,
  median,
  openingFamily,
  openingsReport,
  UNKNOWN_OPENING,
} from '../../src/account/openingsReport';
import type { Color, GameRecord, GameResult } from '../../src/game/types';
import type { MoveLabel } from '../../src/review/types';
import { SAMPLE_RECORD, SAMPLE_REVIEWED_RECORD } from '../fixtures/sample-review';

let n = 0;
function game(userColor: Color | undefined, result: GameResult, over: Partial<GameRecord> = {}): GameRecord {
  return {
    ...SAMPLE_RECORD,
    id: `g${n++}`,
    white: { name: 'A', isBot: false },
    black: { name: 'B', isBot: false },
    userColor,
    result,
    ...over,
  };
}

/** The sample review with the labels of the given plies (1-based) changed. */
function reviewed(userColor: Color, labels: Record<number, MoveLabel>): GameRecord {
  const review = SAMPLE_REVIEWED_RECORD.review!;
  return game(userColor, '1-0', {
    review: {
      ...review,
      moves: review.moves.map((m) => ({ ...m, label: labels[m.ply] ?? 'Good' })),
    },
  });
}

describe('helpers', () => {
  it('openingFamily drops the variation', () => {
    expect(openingFamily('Sicilian Defense: Najdorf Variation, English Attack')).toBe('Sicilian Defense');
    expect(openingFamily("King's Pawn Game")).toBe("King's Pawn Game");
  });

  it('median rounds to a whole move', () => {
    expect(median([])).toBeNull();
    expect(median([9, 3, 5])).toBe(5);
    expect(median([4, 7])).toBe(6);
  });

  it('firstWrongMove: the side’s first Inaccuracy or worse, as a full-move number', () => {
    // Sample game: White's Bc4 (ply 11) is an Inaccuracy, Black's Nf6 (ply 14) a Miss.
    expect(firstWrongMove(SAMPLE_REVIEWED_RECORD, 'w')).toBe(6);
    expect(firstWrongMove(SAMPLE_REVIEWED_RECORD, 'b')).toBe(7);
    expect(firstWrongMove(reviewed('w', {}), 'w')).toBeNull();
    expect(firstWrongMove(SAMPLE_RECORD, 'w')).toBeNull(); // not reviewed
  });

  it('firstWrongMove ignores a review that does not fit the game', () => {
    const r = { ...SAMPLE_REVIEWED_RECORD, moves: SAMPLE_REVIEWED_RECORD.moves.slice(0, 10) };
    expect(firstWrongMove(r, 'w')).toBeNull();
  });
});

describe('openingsReport', () => {
  it('groups by opening family and colour with W/D/L and score, most played first', () => {
    const rows = openingsReport([
      { record: game('w', '1-0'), opening: 'Sicilian Defense: Najdorf Variation' },
      { record: game('w', '1/2-1/2'), opening: 'Sicilian Defense: Alapin Variation' },
      { record: game('w', '0-1'), opening: 'Sicilian Defense' },
      { record: game('b', '1-0'), opening: 'Sicilian Defense' },
      { record: game('b', '0-1'), opening: 'French Defense' },
    ]);
    expect(rows.map((r) => [r.name, r.color, r.games, r.won, r.drawn, r.lost, r.score])).toEqual([
      ['Sicilian Defense', 'w', 3, 1, 1, 1, 50],
      ['French Defense', 'b', 1, 1, 0, 0, 100],
      ['Sicilian Defense', 'b', 1, 0, 0, 1, 0],
    ]);
  });

  it('splits by variation on request, and puts games without a name under Unknown', () => {
    const rows = openingsReport(
      [
        { record: game('w', '1-0'), opening: 'Sicilian Defense: Najdorf Variation' },
        { record: game('w', '1-0'), opening: 'Sicilian Defense: Alapin Variation' },
        { record: game('w', '1-0'), opening: null },
      ],
      'variation',
    );
    expect(rows.map((r) => r.name).sort()).toEqual([
      'Sicilian Defense: Alapin Variation',
      'Sicilian Defense: Najdorf Variation',
      UNKNOWN_OPENING,
    ]);
  });

  it('leaves out unfinished games and games with no known side (bot side or userColor)', () => {
    const bot = game(undefined, '1-0', { white: { name: 'You', isBot: false }, black: { name: 'Bot', isBot: true } });
    const rows = openingsReport([
      { record: game(undefined, '1-0'), opening: 'X' },
      { record: game('w', '*'), opening: 'X' },
      { record: bot, opening: 'X' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'X', color: 'w', games: 1, gameIds: [bot.id] });
  });

  it('reports the median first wrong move over reviewed games that had one', () => {
    const rows = openingsReport([
      { record: reviewed('w', { 11: 'Inaccuracy' }), opening: 'X' }, // move 6
      { record: reviewed('w', { 19: 'Blunder' }), opening: 'X' }, // move 10
      { record: reviewed('w', { 3: 'Mistake', 13: 'Blunder' }), opening: 'X' }, // move 2
      { record: reviewed('w', { 2: 'Blunder' }), opening: 'X' }, // only Black erred
      { record: game('w', '1-0'), opening: 'X' }, // not reviewed
    ]);
    expect(rows[0]).toMatchObject({ games: 5, reviewed: 4, wrongGames: 3, wrongAround: 6 });
  });

  it('has no wrong move when nothing is reviewed', () => {
    expect(openingsReport([{ record: game('b', '0-1'), opening: 'X' }])[0]).toMatchObject({ reviewed: 0, wrongAround: null });
  });
});
