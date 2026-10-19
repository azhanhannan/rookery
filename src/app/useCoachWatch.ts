import { useLayoutEffect, useMemo, useState } from 'react';
import { COACH_PRACTICE } from '../config/tunables';
import { holdBot } from '../game/botTurn';
import { stopClock } from '../game/clock';
import { coachWarning, coachWarningText } from '../game/coachWatch';
import { useGameStore } from '../game/gameStore';
import { humanColor, isPractice } from '../game/practice';
import { botColor, plyKey, replay } from '../game/rules';
import type { GameRecord } from '../game/types';

const COACH_KEY = 'rookery.practiceCoach';

function readCoach(): boolean {
  try {
    const v = localStorage.getItem(COACH_KEY);
    return v === null ? COACH_PRACTICE.defaultOn : v === '1';
  } catch {
    return COACH_PRACTICE.defaultOn;
  }
}

function writeCoach(on: boolean): void {
  try {
    localStorage.setItem(COACH_KEY, on ? '1' : '0');
  } catch {
    // ignore: the toggle just won't survive a reload
  }
}

export type CoachWatch = {
  /** The Coach toggle (shown in Practice games only). */
  on: boolean;
  setOn(on: boolean): void;
  /** The open warning about the player's last move, or null. While it is open the bot and its clock wait. */
  warning: string | null;
  /** Dismisses the warning; the bot then plays. */
  keepPlaying(): void;
};

/**
 * Practice games only (never Rated): after the player's move, a rule-proven warning (game/coachWatch.ts).
 * The bot is held and its clock paused until the player takes the move back or keeps playing.
 */
export function useCoachWatch(record: GameRecord): CoachWatch {
  const [on, setOnState] = useState(readCoach);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const n = record.moves.length;
  // The ply and the move: after a takeback a different move at the same ply is a new question.
  const key = `${plyKey(record)}:${record.moves[n - 1]?.uci ?? ''}`;
  const human = humanColor(record);
  // The player has just moved and the bot hasn't answered yet.
  const watching = on && isPractice(record) && human !== null && record.result === '*' && n > 0 && replay(record).turn() === botColor(record);

  const text = useMemo(() => {
    if (!watching) return null;
    const w = coachWarning(replay(record, n - 1).fen(), record.moves[n - 1].uci);
    return w ? coachWarningText(w) : null;
  }, [watching, record, n]);

  const openKey = text && dismissed !== key ? key : null;

  useLayoutEffect(() => {
    if (!openKey) return;
    holdBot(true);
    const { clock } = useGameStore.getState();
    if (clock?.running) useGameStore.setState({ clock: stopClock(clock, Date.now()) });
    return () => {
      // Keep playing: the bot's clock runs again from now. After a takeback the clock was already reset.
      const s = useGameStore.getState();
      const bot = botColor(s.record);
      const same = `${plyKey(s.record)}:${s.record.moves[s.record.moves.length - 1]?.uci ?? ''}` === openKey;
      if (s.clock && s.clock.running === null && bot && same && s.record.result === '*') {
        useGameStore.setState({ clock: { ...s.clock, running: bot, turnStartedAt: Date.now() } });
      }
      holdBot(false);
    };
  }, [openKey]);

  return {
    on,
    setOn(next) {
      setOnState(next);
      writeCoach(next);
    },
    warning: openKey ? text : null,
    keepPlaying: () => setDismissed(key),
  };
}
