import { useSyncExternalStore } from 'react';
import { previewSoundPack, SOUND_PACKS } from '../game/sound';
import { PIECE_SYMBOLS } from '../game/notation';
import {
  ANIMATION_SPEEDS,
  effectiveAnimation,
  savePlaySettings,
  usePlaySettings,
  type PlaySettings,
} from '../settings/playSettings';

const card = 'mb-4 rounded-2xl bg-surface p-5';
const chip = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'}`;

function subscribeMotion(cb: () => void): () => void {
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  } catch {
    return () => {};
  }
}
function reducedMotionNow(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function Toggle({ label, hint, field, s }: { label: string; hint?: string; field: keyof PlaySettings; s: PlaySettings }) {
  const on = s[field] === true;
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[var(--accent)]"
        checked={on}
        onChange={(e) => savePlaySettings({ [field]: e.target.checked })}
      />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Settings → Play: sounds, animation, what the board shows, hidden ratings, move-list symbols. Saved on this device. */
export function PlaySettingsSection() {
  const s = usePlaySettings();
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotionNow, () => false);
  const speed = effectiveAnimation(s, reduced);

  return (
    <section className={card} aria-labelledby="play-heading" data-testid="play-settings">
      <h2 id="play-heading" className="mb-1 font-semibold">Play</h2>
      <p className="mb-3 text-xs text-muted">Sounds, animation and what the board shows.</p>

      <h3 className="mb-1.5 text-sm font-medium">Sounds</h3>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Sound pack">
        {SOUND_PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={s.soundPack === p.id}
            className={chip(s.soundPack === p.id)}
            onClick={() => {
              savePlaySettings({ soundPack: p.id });
              previewSoundPack(p.id, ['move']);
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm text-accent hover:underline disabled:opacity-40"
          onClick={() => previewSoundPack(s.soundPack)}
          disabled={s.soundPack === 'silent'}
          data-testid="sound-preview"
        >
          ▶ Preview
        </button>
      </div>

      <h3 className="mb-1.5 text-sm font-medium">Piece animation</h3>
      <div className="mb-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Piece animation">
        {ANIMATION_SPEEDS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={speed === a.id}
            className={chip(speed === a.id)}
            onClick={() => savePlaySettings({ animation: a.id })}
          >
            {a.name}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted">
        {s.animation === null
          ? reduced
            ? 'Off by default because your device asks for reduced motion.'
            : 'Default.'
          : 'Your choice.'}
      </p>

      <h3 className="mb-0.5 text-sm font-medium">Board</h3>
      <Toggle s={s} field="coordinates" label="Coordinates" hint="Files and ranks along the board's edge." />
      <Toggle s={s} field="legalDots" label="Legal-move dots" hint="Dots on the squares a selected piece can reach." />
      <Toggle s={s} field="lastMove" label="Last-move highlight" />

      <h3 className="mt-3 mb-0.5 text-sm font-medium">Ratings</h3>
      <Toggle
        s={s}
        field="hideRating"
        label="Hide ratings"
        hint="No rating numbers or rating changes on Play, My games or profiles, so you can just play."
      />

      <h3 className="mt-3 mb-0.5 text-sm font-medium">Moves</h3>
      <Toggle
        s={s}
        field="premoves"
        label="Premoves"
        hint="Against a bot, queue one move while it thinks; it plays the moment it's legal. Right-click or Esc cancels."
      />
      <h3 className="mt-3 mb-1.5 text-sm font-medium">Piece symbols in move lists</h3>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Piece symbols in move lists" data-testid="piece-symbols">
        {PIECE_SYMBOLS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={s.pieceSymbols === p.id}
            className={chip(s.pieceSymbols === p.id)}
            onClick={() => savePlaySettings({ pieceSymbols: p.id })}
          >
            {p.name}
          </button>
        ))}
      </div>
    </section>
  );
}
