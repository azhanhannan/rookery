// Premoves on Play (Settings → Play → Premoves, off by default): on the bot's turn the player may queue one
// move; it is played the moment it becomes their turn if it is legal then, otherwise dropped.
import { useEffect, useMemo, type CSSProperties } from 'react';
import { create } from 'zustand';
import { QUICK } from '../config/tunables';
import { useGameStore } from '../game/gameStore';
import { canQueue, resolvePremove, type Premove } from '../game/premove';
import { botColor, replay } from '../game/rules';
import type { Color, GameRecord } from '../game/types';
import { usePlaySettings } from '../settings/playSettings';

type Queued = { premove: Premove; gameId: string } | null;
const usePremoveStore = create<{ queued: Queued }>(() => ({ queued: null }));

export function cancelPremove(): void {
  if (usePremoveStore.getState().queued) usePremoveStore.setState({ queued: null });
}

/** The human's side in a bot game still in progress, else null. */
function playerColor(record: GameRecord): Color | null {
  const bot = botColor(record);
  if (!bot || record.result !== '*') return null;
  return bot === 'w' ? 'b' : 'w';
}

/** Plays (or drops) the queued premove once it is the player's turn; drops it when the game changes or ends. */
function resolveQueued(): void {
  const { queued } = usePremoveStore.getState();
  if (!queued) return;
  const { record } = useGameStore.getState();
  const player = playerColor(record);
  if (record.id !== queued.gameId || !player) {
    cancelPremove();
    return;
  }
  const fen = replay(record).fen();
  if (fen.split(' ')[1] !== player) return;
  usePremoveStore.setState({ queued: null });
  const input = resolvePremove(fen, player, queued.premove);
  // After the bot's move has finished notifying everyone.
  if (input) queueMicrotask(() => useGameStore.getState().move(input));
}

export type PremoveAids = {
  /** For Board's `premove` prop; undefined when premoves are off or not possible now. */
  input?: { color: Color; onQueue: (from: string, to: string) => void };
  /** The queued move's squares, to merge into the board's squareStyles. */
  squareStyles: Record<string, CSSProperties>;
};

export function usePremove(record: GameRecord, viewPly: number): PremoveAids {
  const { premoves } = usePlaySettings();
  const queued = usePremoveStore((s) => s.queued);
  const player = premoves ? playerColor(record) : null;
  const live = viewPly === record.moves.length;

  useEffect(() => {
    if (!premoves) {
      cancelPremove();
      return;
    }
    const unsubscribe = useGameStore.subscribe(resolveQueued);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelPremove();
    };
    // Right-click on the board cancels (the right-drag still draws its arrow).
    const onPointer = (e: PointerEvent) => {
      if (e.button === 2 && (e.target as Element | null)?.closest?.('[data-testid="board"]')) cancelPremove();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [premoves]);

  const fen = useMemo(() => replay(record).fen(), [record]);
  const input = useMemo(() => {
    if (!player || !live) return undefined;
    return {
      color: player,
      onQueue(from: string, to: string) {
        if (canQueue(fen, player, from, to)) usePremoveStore.setState({ queued: { premove: { from, to }, gameId: record.id } });
      },
    };
  }, [player, live, fen, record.id]);

  const squareStyles = useMemo(() => {
    if (!queued || queued.gameId !== record.id) return {};
    const style = { backgroundColor: QUICK.premoveColor };
    return { [queued.premove.from]: style, [queued.premove.to]: style };
  }, [queued, record.id]);

  return { input, squareStyles };
}
