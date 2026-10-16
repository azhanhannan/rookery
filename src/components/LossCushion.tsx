import { useMemo, useState } from 'react';
import { adjacentLevel, levelLabel } from '../bots/botLevels';
import { suggestNextMaiaLevel } from '../bots/maiaLevels';
import { useGameStore } from '../game/gameStore';
import { loadCushionDismissed, lossStreak, saveCushionDismissed, shouldCushion } from '../game/lossStreak';
import { loadHistory } from '../game/storage';
import { getMaia } from '../maia/MaiaService';

/**
 * After QUICK.lossStreak losses in a row against bots: "Want an easier bot or a few puzzles to warm up?".
 * Shown on Play between games; dismissing (or taking either offer) hides it until the next losing streak.
 */
export function LossCushion() {
  const record = useGameStore((s) => s.record);
  const between = record.result !== '*' || record.moves.length === 0;
  // History changes when a game is archived, which also changes `record`.
  const streak = useMemo(() => lossStreak(loadHistory()), [record]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dismissed, setDismissed] = useState(loadCushionDismissed);
  const [loading, setLoading] = useState(false);

  if (!between || !shouldCushion(streak, dismissed) || !streak.startId) return null;
  const startId = streak.startId;
  const bot = streak.lastBot;
  const maia = bot?.engine === 'maia';
  const easier =
    bot?.elo === undefined
      ? null
      : maia
        ? { elo: suggestNextMaiaLevel(bot.elo, 'loss'), name: `Maia ${suggestNextMaiaLevel(bot.elo, 'loss')}` }
        : { elo: adjacentLevel(bot.elo, -1).elo, name: `Bot ${levelLabel(adjacentLevel(bot.elo, -1))}` };

  function dismiss() {
    saveCushionDismissed(startId);
    setDismissed(startId);
  }

  async function playEasier() {
    if (!easier) return;
    let engine: 'maia' | undefined = maia ? 'maia' : undefined;
    let elo = easier.elo;
    if (maia && !getMaia().isLoaded()) {
      setLoading(true);
      try {
        await getMaia().load();
      } catch {
        engine = undefined;
        elo = adjacentLevel(elo, 0).elo;
      } finally {
        setLoading(false);
      }
    }
    dismiss();
    const { setup, newGame } = useGameStore.getState();
    newGame({ ...setup, opponent: 'bot', botElo: elo, botEngine: engine, startFen: undefined });
  }

  const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
  return (
    <div data-testid="loss-cushion" className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">
          {streak.count} tough games in a row. Want an easier bot or a few puzzles to warm up?
        </p>
        <button className="text-sm text-muted hover:text-ink" aria-label="Dismiss" onClick={dismiss}>
          ✕
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {easier && (
          <button className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50" onClick={() => void playEasier()} disabled={loading}>
            {loading ? 'Loading…' : `Play ${easier.name}`}
          </button>
        )}
        <a className={btn} href="#/puzzles" onClick={dismiss}>
          Puzzles
        </a>
      </div>
    </div>
  );
}
