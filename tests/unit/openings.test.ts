import { Chess, DEFAULT_POSITION } from 'chess.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  isBookPosition,
  loadOpenings,
  lookupBook,
  openingAt,
  parseIndex,
  toEpd,
} from '../../src/openings/openings';

/** fenAfter for each SAN move, as the game store records them. */
function fens(sans: string[], start = DEFAULT_POSITION): { fenAfter: string }[] {
  const chess = new Chess(start);
  return sans.map((san) => {
    chess.move(san);
    return { fenAfter: chess.fen() };
  });
}

const NAJDORF = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];

beforeAll(() => loadOpenings());

describe('lookupBook', () => {
  it('names the Najdorf', async () => {
    const book = await lookupBook(DEFAULT_POSITION, fens(NAJDORF));
    expect(book.bookPlies).toBe(10);
    expect(book.eco).toMatch(/^B9\d$/);
    expect(book.name).toMatch(/Sicilian Defense: Najdorf Variation/);
  });

  it('keeps the deepest name when the game stays in book past it', async () => {
    const book = await lookupBook(DEFAULT_POSITION, fens([...NAJDORF, 'Be2']));
    expect(book.bookPlies).toBe(11);
    expect(book.name).toMatch(/Najdorf/);
  });

  it('stops at the first move out of book', async () => {
    const book = await lookupBook(DEFAULT_POSITION, fens([...NAJDORF, 'Kd2']));
    expect(book.bookPlies).toBe(10);
  });

  it('counts a transposition into a known position', async () => {
    // The Queen's Gambit Declined usually comes from 1.d4 d5 2.c4 e6; here 1.c4 e6 2.d4 d5.
    const direct = await lookupBook(DEFAULT_POSITION, fens(['d4', 'd5', 'c4', 'e6']));
    const transposed = await lookupBook(DEFAULT_POSITION, fens(['c4', 'e6', 'd4', 'd5']));
    expect(transposed.bookPlies).toBe(4);
    expect(transposed.name).toBe(direct.name);
    expect(transposed.eco).toBe(direct.eco);
  });

  it('does not let a later return to a book position count', async () => {
    // 2.Nh3 leaves book; the knight goes home and comes back out as 1.e4 e5 2.Nf3 Nc6.
    const sans = ['e4', 'e5', 'Nh3', 'Nc6', 'Ng1', 'Nb8', 'Nf3', 'Nc6'];
    expect(isBookPosition(fens(sans)[2].fenAfter)).toBe(false);
    const later = fens(sans).slice(3).some((m) => isBookPosition(m.fenAfter));
    expect(later).toBe(true);
    const book = await lookupBook(DEFAULT_POSITION, fens(sans));
    expect(book.bookPlies).toBe(2);
    expect(book.name).toMatch(/King's Pawn/);
  });

  it('has no book for a non-standard start position', async () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
    const book = await lookupBook(start, fens(['e5'], start));
    expect(book).toEqual({ bookPlies: 0 });
  });

  it('ignores the move counters of the start position', async () => {
    const book = await lookupBook(DEFAULT_POSITION.replace(/0 1$/, '3 7'), fens(['e4']));
    expect(book.bookPlies).toBe(1);
  });

  it('returns no book for a game with no moves', async () => {
    expect(await lookupBook(DEFAULT_POSITION, [])).toEqual({ bookPlies: 0 });
  });
});

describe('position lookups', () => {
  it('names positions that the dataset names, and only those', () => {
    const [e4] = fens(['e4']);
    expect(openingAt(e4.fenAfter)).toEqual({ eco: 'B00', name: "King's Pawn Game" });
    expect(openingAt(DEFAULT_POSITION)).toBeUndefined();
  });

  it('treats unnamed positions on a named line as book', () => {
    // A00 Amar Opening: Paris Gambit is 1. Nh3 d5 2. g3 e5 3. f4; 1.Nh3 d5 has no name of its own.
    const [, nh3d5] = fens(['Nh3', 'd5']);
    expect(isBookPosition(nh3d5.fenAfter)).toBe(true);
  });

  it('matches a FEN that names an en-passant square nobody can capture on', () => {
    const [e4] = fens(['e4']);
    const withEp = e4.fenAfter.replace(' KQkq - ', ' KQkq e3 ');
    expect(openingAt(withEp)?.name).toBe("King's Pawn Game");
  });

  it('uses EPD keys: placement, side, castling, en passant', () => {
    expect(toEpd(DEFAULT_POSITION)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('parses index rows with and without names, tolerating CRLF', () => {
    const index = parseIndex('a w - -\tA00\tX\r\nb w - -\r\n');
    expect(index.get('a w - -')).toEqual({ eco: 'A00', name: 'X' });
    expect(index.get('b w - -')).toBeNull();
    expect(index.size).toBe(2);
  });
});
