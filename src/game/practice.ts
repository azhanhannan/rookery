// Practice games against a bot: unrated, with takebacks and helpers. Pure helpers plus the takeback action;
// the UI lives in components/PracticePanel.tsx.
import { Chess } from 'chess.js';
import { findTimeControl, type ClockState } from './clock';
import { useGameStore } from './gameStore';
import { botColor } from './rules';
import { loadHistory } from './storage';
import type { Color, GameRecord } from './types';

export type GameMode = 'rated' | 'practice';

const MODE_KEY = 'rookery.gameMode';

/** The Rated / Practice choice this device made last (bot games), or null. */
export function loadGameMode(): GameMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'rated' || v === 'practice' ? v : null;
  } catch {
    return null;
  }
}

export function saveGameMode(mode: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore: the choice just won't be remembered
  }
}

/** A practice game: only bot games carry the flag; games saved before it existed are not practice. */
export function isPractice(record: Pick<GameRecord, 'practice'>): boolean {
  return record.practice === true;
}

/** The human's colour in a bot game, else null. */
export function humanColor(record: GameRecord): Color | null {
  const bot = botColor(record);
  return bot ? (bot === 'w' ? 'b' : 'w') : null;
}

/** Colour that played ply `i` (0-based) of a game starting from `startFen`. */
function moverOf(startFen: string, i: number): Color {
  const first = startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  return i % 2 === 0 ? first : first === 'w' ? 'b' : 'w';
}

/**
 * How many plies a takeback removes: the human's last move, plus the bot's reply when it has already moved.
 * 0 when the human has no move to take back.
 */
export function takebackPlies(record: GameRecord, human: Color): number {
  const n = record.moves.length;
  if (n === 0) return 0;
  if (moverOf(record.startFen, n - 1) === human) return 1;
  return n >= 2 ? 2 : 0;
}

/**
 * The clock after cutting the game to `moves` plies: each side gets back the time it had after its last kept
 * move (the base time when it has none), and the side to move runs from `now` (nothing runs before White's first move).
 */
export function clockAfterTakeback(clock: ClockState, record: GameRecord, keep: number, now: number): ClockState {
  const base = findTimeControl(record.timeControl)?.baseMs;
  const next: ClockState = { ...clock };
  for (const color of ['w', 'b'] as Color[]) {
    let ms: number | undefined;
    for (let i = keep - 1; i >= 0; i--) {
      if (moverOf(record.startFen, i) === color) {
        ms = record.moves[i].clockMs;
        break;
      }
    }
    const fallback = base ?? clock[color];
    next[color] = ms ?? fallback;
  }
  if (keep === 0) {
    next.running = null;
    next.turnStartedAt = null;
  } else {
    next.running = moverOf(record.startFen, keep);
    next.turnStartedAt = now;
  }
  return next;
}

/** True when the live game is a practice game in progress with a human move to take back. */
export function canTakeBack(record: GameRecord): boolean {
  const human = humanColor(record);
  return isPractice(record) && record.result === '*' && human !== null && takebackPlies(record, human) > 0;
}

/**
 * Practice only: undoes the human's last move (and the bot's reply). The bot runner sees the ply change and
 * drops any move it was still computing. Returns false when nothing was taken back.
 */
export function takeBack(): boolean {
  const { record, clock } = useGameStore.getState();
  const human = humanColor(record);
  if (!human || !canTakeBack(record)) return false;
  const keep = record.moves.length - takebackPlies(record, human);
  // Counted per press (one or two plies), so later analysis can tell played-through games from taken-back ones.
  const next: GameRecord = { ...record, moves: record.moves.slice(0, keep), takebacks: (record.takebacks ?? 0) + 1 };
  useGameStore.setState({
    record: next,
    clock: clock ? clockAfterTakeback(clock, record, keep, Date.now()) : null,
    viewPly: keep,
  });
  return true;
}

/**
 * The position with the other side to move, to ask the engine what the opponent threatens (a null move).
 * Null when the side to move is in check (a null move would be illegal) or the swapped position is invalid.
 */
export function nullMoveFen(fen: string): string | null {
  const parts = fen.split(' ');
  if (parts.length < 4) return null;
  try {
    if (new Chess(fen).inCheck()) return null;
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-'; // en passant is only available right after the double step
    const swapped = parts.join(' ');
    const chess = new Chess(swapped);
    return chess.moves().length > 0 ? swapped : null;
  } catch {
    return null;
  }
}

/** Which of `ids` are practice games saved on this device (My games tags them; server summaries carry no flag). */
export function practiceIdsOnDevice(ids: string[]): Set<string> {
  const wanted = new Set(ids);
  return new Set(loadHistory().filter((g) => isPractice(g) && wanted.has(g.id)).map((g) => g.id));
}
