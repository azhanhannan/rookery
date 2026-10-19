// When to ask about two same-colour repertoires that answer one position differently (per device, in
// `rookery.openings.conflicts`): once when the clash is first seen, and once more after 3 mix-ups between them.
// Never a third time; "Keep both" is always an answer.
const KEY = 'rookery.openings.conflicts';
/** Mix-ups between the two before the second (last) ask. */
export const MIXUPS_BEFORE_SECOND_ASK = 3;

type Entry = { asked: number; mixups: number };
type Book = Record<string, Entry>;

/** The pair's key, the same whichever order the two come in. */
export const pairKey = (a: string, b: string) => [a, b].sort().join('|');

function read(): Book {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Book;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function write(b: Book): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // the prompt may come back after a reload
  }
}

const entry = (b: Book, k: string): Entry => ({ asked: b[k]?.asked ?? 0, mixups: b[k]?.mixups ?? 0 });

/** Whether to ask about the pair now. */
export function shouldAsk(a: string, b: string): boolean {
  const e = entry(read(), pairKey(a, b));
  return e.asked === 0 || (e.asked === 1 && e.mixups >= MIXUPS_BEFORE_SECOND_ASK);
}

/** The pair was asked about (whatever the answer). */
export function markAsked(a: string, b: string): void {
  const book = read();
  const k = pairKey(a, b);
  const e = entry(book, k);
  book[k] = { asked: e.asked + 1, mixups: 0 };
  write(book);
}

/** The user played the other repertoire's move in a drill. */
export function countMixup(a: string, b: string): void {
  const book = read();
  const k = pairKey(a, b);
  const e = entry(book, k);
  book[k] = { ...e, mixups: e.mixups + 1 };
  write(book);
}
