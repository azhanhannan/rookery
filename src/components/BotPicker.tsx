import { levelFor, levelLabel } from '../bots/botLevels';
import { BOT_LEVELS, DEFAULT_BOT_ELO, MAIA } from '../config/tunables';
import type { BotEngine } from '../game/types';

const pill = (active: boolean) =>
  `rounded-lg px-1 py-2 text-sm font-medium tabular-nums ${
    active ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'
  }`;

const STYLES: { id: BotEngine; label: string }[] = [
  { id: 'stockfish', label: 'Engine' },
  { id: 'maia', label: 'Human-like' },
];

function describe(elo: number): string {
  const level = levelFor(elo);
  if (level.mode === 'full') return 'Full strength, no limit.';
  if (level.mode === 'limit') return `About ${level.elo} Elo.`;
  return `About ${level.elo} Elo. Makes beginner mistakes on purpose.`;
}

const describeMaia = (elo: number) =>
  `Plays the moves a ${elo}-rated online player tends to play, mistakes included (Maia neural network).`;

type Props = {
  /** Bot style: 'stockfish' (Engine) or 'maia' (Human-like). */
  engine: BotEngine;
  onEngineChange: (engine: BotEngine) => void;
  /** Level of the current style: a BOT_LEVELS elo for Engine, a MAIA.levels elo for Human-like. */
  value: number;
  onChange: (elo: number) => void;
};

export function BotPicker({ engine, onEngineChange, value, onChange }: Props) {
  const maia = engine === 'maia';
  const levels = maia ? MAIA.levels.map((elo) => ({ elo, label: String(elo) })) : BOT_LEVELS.map((l) => ({ elo: l.elo, label: levelLabel(l) }));
  const fallback = maia ? MAIA.defaultElo : DEFAULT_BOT_ELO;
  return (
    <>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm text-muted">Style</legend>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                engine === s.id ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'
              }`}
              aria-pressed={engine === s.id}
              onClick={() => onEngineChange(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm text-muted">Bot level</legend>
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Bot level">
          {levels.map((level) => (
            <button
              key={level.elo}
              className={pill(value === level.elo)}
              aria-pressed={value === level.elo}
              onClick={() => onChange(level.elo)}
            >
              {level.label}
            </button>
          ))}
        </div>
        <button
          className="mt-2 w-full rounded-lg px-3 py-1.5 text-sm text-accent underline-offset-2 hover:underline"
          onClick={() => onChange(fallback)}
        >
          I don't know my level (try {fallback})
        </button>
        <p className="mt-1 text-xs text-muted">{maia ? describeMaia(value) : describe(value)}</p>
      </fieldset>
    </>
  );
}
