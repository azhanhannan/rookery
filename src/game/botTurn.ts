import { create } from 'zustand';
import { levelFor } from '../bots/botLevels';
import { chooseMove, thinkTime } from '../bots/botPlayer';
import { chooseMaiaMove, maiaThinkTime } from '../bots/maiaPlayer';
import { getEngine } from '../engine/EngineService';
import type { Engine } from '../engine/types';
import { getMaia } from '../maia/MaiaService';
import { useGameStore } from './gameStore';
import { botColor, plyKey, replay } from './rules';
import type { GameRecord } from './types';

export type BotStatus = {
  /** The bot is choosing (or waiting out its think time for) a move in the live game. */
  thinking: boolean;
  /** Set when the bot could not move; play stops until `retryBotMove()`. */
  error: string | null;
};

export const useBotStatus = create<BotStatus>(() => ({ thinking: false, error: null }));

type Job = {
  key: string;
  cancelled: boolean;
  timer?: ReturnType<typeof setTimeout>;
  /** A human-like (Maia) bot's turn: Stockfish is not involved, so cancelling must not stop it. */
  maia?: boolean;
};

// One runner for the app: the engine is single, so two runners would fight over it.
let job: Job | null = null;
let engine: Engine | null = null;
let failedKey: string | null = null;
let unsubscribe: (() => void) | null = null;

/** The key of the live position when a bot is to move in a game still in progress, else null. */
export function botTurnKey(record: GameRecord): string | null {
  const bot = botColor(record);
  if (!bot || record.result !== '*') return null;
  return replay(record).turn() === bot ? plyKey(record) : null;
}

function cancel(): void {
  if (!job) return;
  job.cancelled = true;
  if (job.timer) clearTimeout(job.timer);
  const wasMaia = job.maia === true;
  job = null;
  // Ends the search early; its result is dropped because the job is cancelled.
  if (!wasMaia) engine?.stop();
  useBotStatus.setState({ thinking: false });
}

function wait(current: Job, ms: number): Promise<void> {
  return new Promise((resolve) => {
    current.timer = setTimeout(resolve, ms);
  });
}

/** The Stockfish bot's move and think time (the BOT_LEVELS bots). Null when the job was cancelled. */
async function engineMove(current: Job, record: GameRecord, elo: number): Promise<{ uci: string; think: number } | null> {
  const level = levelFor(elo);
  // getEngine may throw synchronously (stub) or reject; both land in run's catch.
  const e = await Promise.resolve().then(getEngine);
  if (current.cancelled) return null;
  engine = e;
  // The bot has priority over the live eval bar: end any analysis still running first.
  e.stop();
  const uci = await chooseMove(e, replay(record).fen(), level);
  if (current.cancelled) return null;
  return { uci, think: thinkTime(level) };
}

/** The human-like bot's move (MAIA levels); the first call may download the model. */
async function maiaMove(current: Job, record: GameRecord, elo: number): Promise<{ uci: string; think: number } | null> {
  const uci = await chooseMaiaMove(getMaia(), replay(record).fen(), elo);
  if (current.cancelled) return null;
  return { uci, think: maiaThinkTime() };
}

async function run(current: Job, record: GameRecord): Promise<void> {
  const started = Date.now();
  const player = record[botColor(record) === 'w' ? 'white' : 'black'];
  const elo = player.elo ?? 0;
  try {
    const choice = current.maia ? await maiaMove(current, record, elo) : await engineMove(current, record, elo);
    if (!choice) return;
    const { uci } = choice;
    // A human-feeling pace: the search time counts towards the think time.
    await wait(current, Math.max(0, choice.think - (Date.now() - started)));
    if (current.cancelled || plyKey(useGameStore.getState().record) !== current.key) return;

    // Clear the job before moving: move() notifies subscribers, and the next turn must start fresh.
    job = null;
    useBotStatus.setState({ thinking: false });
    const ok = useGameStore.getState().move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!ok) fail(current.key, `The bot chose an illegal move (${uci}).`);
  } catch (err) {
    if (current.cancelled) return;
    job = null;
    fail(current.key, err instanceof Error ? err.message : String(err));
  }
}

function fail(key: string, detail: string): void {
  failedKey = key;
  useBotStatus.setState({ thinking: false, error: `The bot couldn't move: ${detail}` });
}

/** Starts or cancels the bot's move to match the live game. Runs on every store change. */
function sync(): void {
  const { record } = useGameStore.getState();
  const key = botTurnKey(record);
  if (job && job.key === key) return;
  cancel();
  if (failedKey !== key) {
    failedKey = null;
    if (useBotStatus.getState().error) useBotStatus.setState({ error: null });
  }
  if (!key || failedKey === key) return;

  const bot = botColor(record);
  const maia = bot !== null && record[bot === 'w' ? 'white' : 'black'].engine === 'maia';
  const current: Job = maia ? { key, cancelled: false, maia } : { key, cancelled: false };
  job = current;
  useBotStatus.setState({ thinking: true, error: null });
  void run(current, record);
}

/** Watches the game store and plays the bot's moves. Returns a function that stops it. */
export function startBotTurns(): () => void {
  stopBotTurns();
  unsubscribe = useGameStore.subscribe(sync);
  sync();
  return stopBotTurns;
}

function stopBotTurns(): void {
  unsubscribe?.();
  unsubscribe = null;
  cancel();
}

/** Tries the bot's move again after an error. */
export function retryBotMove(): void {
  failedKey = null;
  useBotStatus.setState({ error: null });
  if (unsubscribe) sync();
}
