import type { PracticeAids } from '../app/usePracticeAids';

/** The Practice tag, shown on Play and in My games. */
export function PracticeTag({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="practice-tag"
      className={`inline-block rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-accent ${className}`}
      title="Practice game: unrated, takebacks and hints allowed"
    >
      Practice
    </span>
  );
}

/** Practice-only helpers next to the board: takeback, threat, hint, hanging-piece glow. Renders nothing in other games. */
export function PracticePanel({ aids }: { aids: PracticeAids }) {
  if (!aids.practice) return null;
  const btn =
    'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
  const { aid } = aids;
  const pending = aid?.state === 'pending';
  return (
    <section data-testid="practice-panel" aria-label="Practice helpers" className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <PracticeTag />
        <span className="text-xs text-muted">Unrated: helpers allowed</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className={btn} onClick={aids.takeBack} disabled={!aids.canTakeBack} data-testid="takeback">
          ↶ Takeback
        </button>
        <button
          className={btn}
          onClick={() => aids.ask('threat')}
          disabled={!aids.canAsk || pending}
          aria-pressed={aid?.kind === 'threat' && aid.state === 'done'}
          data-testid="show-threat"
        >
          {pending && aid?.kind === 'threat' ? 'Looking…' : 'Show threat'}
        </button>
        <button
          className={btn}
          onClick={() => aids.ask('hint')}
          disabled={!aids.canAsk || pending}
          aria-pressed={aid?.kind === 'hint' && aid.state === 'done'}
          data-testid="hint"
        >
          {pending && aid?.kind === 'hint' ? 'Thinking…' : 'Hint'}
        </button>
        <button
          className={btn}
          onClick={() => aids.setGlowOn(!aids.glowOn)}
          aria-pressed={aids.glowOn}
          title="Glow on your pieces that can be taken for free or by a cheaper piece"
          data-testid="hanging-toggle"
        >
          {aids.glowOn ? 'Hanging glow on' : 'Hanging glow off'}
        </button>
      </div>
      {aid?.state === 'done' && (
        <p className="text-xs text-muted" role="status">
          {aid.kind === 'threat' ? 'Red arrow: what your opponent threatens.' : 'Hint: the outlined piece is the one to move.'}
        </p>
      )}
      {aid?.state === 'none' && (
        <p className="text-xs text-muted" role="status">
          {aid.message}
        </p>
      )}
      {aids.glowOn && aids.hanging.length > 0 && (
        <p className="text-xs text-muted" data-testid="hanging-note">
          {aids.hanging.length === 1 ? '1 piece is' : `${aids.hanging.length} pieces are`} hanging (glowing).
        </p>
      )}
    </section>
  );
}
