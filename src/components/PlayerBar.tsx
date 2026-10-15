import { useEffect, useRef, useState } from 'react';
import { useBotStatus } from '../game/botTurn';
import { formatClock, isLowTime, lowTimeTickDue, remaining } from '../game/clock';
import { useGameStore } from '../game/gameStore';
import { playSound } from '../game/sound';
import type { Color } from '../game/types';
import { usePlaySettings } from '../settings/playSettings';

export function PlayerBar({ color }: { color: Color }) {
  const player = useGameStore((s) => (color === 'w' ? s.record.white : s.record.black));
  const clock = useGameStore((s) => s.clock);
  const flag = useGameStore((s) => s.flag);
  const thinking = useBotStatus((s) => s.thinking) && player.isBot;
  const [now, setNow] = useState(() => Date.now());
  const running = clock?.running === color;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  // `now` only ticks while running, so it can predate the turn start; never count negative time.
  const left = clock ? remaining(clock, color, Math.max(now, clock.turnStartedAt ?? 0)) : null;

  useEffect(() => {
    if (running && left !== null && left <= 0) flag(color);
  }, [running, left, flag, color]);

  // A soft tick each second when a person's own clock runs low (bots' clocks stay quiet; mute and Silent apply).
  const prevLeft = useRef<number | null>(null);
  const human = !player.isBot;
  useEffect(() => {
    const prev = prevLeft.current;
    prevLeft.current = running ? left : null;
    if (running && human && left !== null && lowTimeTickDue(prev, left)) playSound('lowTime');
  }, [running, human, left]);
  const { hideRating } = usePlaySettings();

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        <span
          className={`inline-block h-3 w-3 rounded-full border border-muted ${color === 'w' ? 'bg-white' : 'bg-neutral-900'}`}
          aria-hidden
        />
        <span className="font-medium">{player.name}</span>
        {/* A bot's name already carries its level. */}
        {!hideRating && player.elo !== undefined && !player.name.endsWith(String(player.elo)) && <span className="text-sm text-muted">({player.elo})</span>}
        <span aria-live="polite" className="text-sm text-muted">
          {thinking && (
            <span data-testid="bot-thinking" className="animate-pulse">
              Bot is thinking…
            </span>
          )}
        </span>
      </div>
      {left !== null && (
        <span
          data-testid={`clock-${color}`}
          className={`min-w-20 rounded-md px-2.5 py-1 text-right font-mono text-lg tabular-nums ${
            running ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'
          } ${isLowTime(left) ? (running ? '!bg-danger !text-white' : '!text-danger') : ''}`}
        >
          {formatClock(left)}
        </span>
      )}
    </div>
  );
}
