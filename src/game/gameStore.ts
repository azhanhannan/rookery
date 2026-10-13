import { create } from 'zustand';
import { levelFor, levelLabel } from '../bots/botLevels';
import { findTimeControl, newClock, pressClock, stopClock, type ClockState } from './clock';
import { fromPgn, toPgn } from './pgn';
import {
  applyMove,
  botColor,
  endRecord,
  newRecord,
  replay,
  resignationEnd,
  timeoutEnd,
  type GameEnd,
  type MoveInput,
} from './rules';
import { playSound } from './sound';
import { archiveGame, loadSession, saveSession } from './storage';
import type { Color, GameRecord, NewGameOptions, PlayerInfo } from './types';

export type { SideChoice } from './types';
export type Orientation = 'white' | 'black';

type GameState = {
  record: GameRecord;
  clock: ClockState | null;
  orientation: Orientation;
  /** Ply shown on the board; equals record.moves.length when viewing the live position. */
  viewPly: number;
  /** The options the current game was started with (an imported game keeps the previous ones). */
  setup: NewGameOptions;

  newGame(opts: NewGameOptions): void;
  /** Plays a move from the live position. Returns false when it is illegal or the game is over. */
  move(input: MoveInput): boolean;
  /** In a bot game the human resigns; between people, the side to move does. */
  resign(): void;
  flag(color: Color): void;
  goTo(ply: number): void;
  step(delta: number): void;
  flip(): void;
  importPgn(text: string): void;
  exportPgn(): string;
};

const DEFAULT_SETUP: NewGameOptions = { side: 'w', timeControlId: 'unlimited', opponent: 'friend' };

function botPlayer(elo: number | undefined): PlayerInfo {
  const level = levelFor(elo ?? 0);
  return { name: `Bot ${levelLabel(level)}`, isBot: true, elo: level.elo };
}

function freshState(setup: NewGameOptions) {
  const { side, timeControlId } = setup;
  const color: Color = side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : side;
  const tc = findTimeControl(timeControlId);
  const vsBot = setup.opponent === 'bot';
  const you: PlayerInfo = { name: vsBot ? 'You' : 'Player 1', isBot: false };
  const friend: PlayerInfo = vsBot ? botPlayer(setup.botElo) : { name: 'Player 2', isBot: false };
  return {
    setup,
    record: newRecord({
      white: color === 'w' ? you : friend,
      black: color === 'w' ? friend : you,
      timeControl: tc?.id,
    }),
    clock: tc ? newClock(tc) : null,
    orientation: (color === 'w' ? 'white' : 'black') as Orientation,
    viewPly: 0,
  };
}

function initialState() {
  const saved = loadSession();
  if (!saved) return freshState(DEFAULT_SETUP);
  // The time spent away (refresh, closed tab) is not charged: the running clock restarts now.
  const clock = saved.clock?.running ? { ...saved.clock, turnStartedAt: Date.now() } : saved.clock;
  return {
    record: saved.record,
    clock,
    orientation: saved.orientation,
    viewPly: saved.record.moves.length,
    setup: saved.setup ?? DEFAULT_SETUP,
  };
}

function finish(record: GameRecord, clock: ClockState | null, end: GameEnd) {
  playSound('end');
  const ended = endRecord(record, end);
  archiveGame(ended);
  return { record: ended, clock: clock ? stopClock(clock, Date.now()) : null };
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState(),

  newGame(opts) {
    set(freshState(opts));
  },

  move(input) {
    const { record, clock } = get();
    const mover: Color = replay(record).turn();
    const now = Date.now();
    const pressed = clock ? pressClock(clock, mover, now) : null;
    const res = applyMove(record, input, pressed ? pressed[mover] : undefined);
    if (!res) return false;

    const { record: next, move } = res;
    if (next.result !== '*') {
      archiveGame(next);
      playSound('end');
      set({ record: next, clock: pressed ? stopClock(pressed, now) : null, viewPly: next.moves.length });
      return true;
    }
    playSound(move.san.includes('+') ? 'check' : move.captured ? 'capture' : 'move');
    set({ record: next, clock: pressed, viewPly: next.moves.length });
    return true;
  },

  resign() {
    const { record, clock } = get();
    if (record.result !== '*') return;
    const bot = botColor(record);
    const resigning: Color = bot ? (bot === 'w' ? 'b' : 'w') : replay(record).turn();
    set({ ...finish(record, clock, resignationEnd(resigning)), viewPly: record.moves.length });
  },

  flag(color) {
    const { record, clock } = get();
    if (record.result !== '*' || !clock) return;
    const flagged = { ...clock, [color]: 0 };
    set({ ...finish(record, flagged, timeoutEnd(replay(record), color)), viewPly: record.moves.length });
  },

  goTo(ply) {
    const max = get().record.moves.length;
    set({ viewPly: Math.max(0, Math.min(max, ply)) });
  },

  step(delta) {
    get().goTo(get().viewPly + delta);
  },

  flip() {
    set({ orientation: get().orientation === 'white' ? 'black' : 'white' });
  },

  importPgn(text) {
    const record = fromPgn(text);
    // An imported game in progress continues without a clock; its %clk times stay on the moves.
    set({
      record,
      clock: null,
      orientation: 'white',
      viewPly: record.moves.length,
    });
    if (record.result !== '*') archiveGame(record);
  },

  exportPgn() {
    return toPgn(get().record);
  },
}));

// Persist every change so a refresh never loses a game.
useGameStore.subscribe((s) => {
  saveSession({ record: s.record, clock: s.clock, orientation: s.orientation, setup: s.setup });
});
