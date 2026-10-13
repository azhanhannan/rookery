import { levelFor, levelLabel } from '../bots/botLevels';
import { BOT_LEVELS, DEFAULT_BOT_ELO } from '../config/tunables';

const pill = (active: boolean) =>
  `rounded-lg px-1 py-2 text-sm font-medium tabular-nums ${
    active ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'
  }`;

function describe(elo: number): string {
  const level = levelFor(elo);
  if (level.mode === 'full') return 'Full strength, no limit.';
  if (level.mode === 'limit') return `About ${level.elo} Elo.`;
  return `About ${level.elo} Elo. Makes beginner mistakes on purpose.`;
}

export function BotPicker({ value, onChange }: { value: number; onChange: (elo: number) => void }) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-2 text-sm text-muted">Bot level</legend>
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Bot level">
        {BOT_LEVELS.map((level) => (
          <button
            key={level.elo}
            className={pill(value === level.elo)}
            aria-pressed={value === level.elo}
            onClick={() => onChange(level.elo)}
          >
            {levelLabel(level)}
          </button>
        ))}
      </div>
      <button
        className="mt-2 w-full rounded-lg px-3 py-1.5 text-sm text-accent underline-offset-2 hover:underline"
        onClick={() => onChange(DEFAULT_BOT_ELO)}
      >
        I don't know my level (try {DEFAULT_BOT_ELO})
      </button>
      <p className="mt-1 text-xs text-muted">{describe(value)}</p>
    </fieldset>
  );
}
