import type { ClockState } from './clock';
import type { BotEngine, GameRecord, NewGameOptions } from './types';

const CURRENT_KEY = 'rookery.current';
const HISTORY_KEY = 'rookery.games';
const HISTORY_LIMIT = 100;

export type SavedSession = {
  record: GameRecord;
  clock: ClockState | null;
  orientation: 'white' | 'black';
  /** Absent in sessions saved before Phase 2. */
  setup?: NewGameOptions;
};

// Storage can be missing or throw (private mode, blocked site data); the app must work without it.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage full or unavailable
  }
}

export function loadSession(): SavedSession | null {
  const s = read<SavedSession>(CURRENT_KEY);
  if (!s || !s.record || !Array.isArray(s.record.moves)) return null;
  return s;
}

export function saveSession(session: SavedSession): void {
  write(CURRENT_KEY, session);
}

export function loadHistory(): GameRecord[] {
  return read<GameRecord[]>(HISTORY_KEY) ?? [];
}

/** Adds or replaces a finished game in the saved list, newest first. */
export function archiveGame(record: GameRecord): void {
  const rest = loadHistory().filter((g) => g.id !== record.id);
  write(HISTORY_KEY, [record, ...rest].slice(0, HISTORY_LIMIT));
}

/** Replaces a saved game in place (keeping the list order); adds it at the front when it isn't saved yet. */
export function updateArchivedGame(record: GameRecord): void {
  const history = loadHistory();
  const i = history.findIndex((g) => g.id === record.id);
  if (i < 0) {
    archiveGame(record);
    return;
  }
  history[i] = record;
  write(HISTORY_KEY, history);
}

/** A saved game by id, or null. */
export function findArchivedGame(id: string): GameRecord | null {
  return loadHistory().find((g) => g.id === id) ?? null;
}

const BOT_ELO_KEY = 'rookery.botElo';
const EVAL_BAR_KEY = 'rookery.evalBar';

/** The bot level this viewer chose last, if any. */
export function loadBotElo(): number | null {
  const elo = read<number>(BOT_ELO_KEY);
  return typeof elo === 'number' && Number.isFinite(elo) ? elo : null;
}

export function saveBotElo(elo: number): void {
  write(BOT_ELO_KEY, elo);
}

/** The viewer's eval bar choice, or null when they never toggled it. */
export function loadEvalBarPref(): boolean | null {
  const on = read<boolean>(EVAL_BAR_KEY);
  return typeof on === 'boolean' ? on : null;
}

export function saveEvalBarPref(on: boolean): void {
  write(EVAL_BAR_KEY, on);
}

const BOT_ENGINE_KEY = 'rookery.botEngine';
const MAIA_ELO_KEY = 'rookery.maiaElo';

/** The bot style this viewer chose last ('stockfish' = Engine, 'maia' = Human-like), if any. */
export function loadBotEngine(): BotEngine | null {
  const engine = read<string>(BOT_ENGINE_KEY);
  return engine === 'stockfish' || engine === 'maia' ? engine : null;
}

export function saveBotEngine(engine: BotEngine): void {
  write(BOT_ENGINE_KEY, engine);
}

/** The human-like bot level this viewer chose last, if any (kept apart from the engine bot's level). */
export function loadMaiaElo(): number | null {
  const elo = read<number>(MAIA_ELO_KEY);
  return typeof elo === 'number' && Number.isFinite(elo) ? elo : null;
}

export function saveMaiaElo(elo: number): void {
  write(MAIA_ELO_KEY, elo);
}
