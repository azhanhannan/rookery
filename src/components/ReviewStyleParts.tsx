// Review-style pieces of the review screen: badges, the style switch, the Learner and Analyst move lists,
// and the Review section of Settings.
import { useEffect, useRef } from 'react';
import {
  analystScore,
  nagFor,
  QUIET_LABELS,
  REVIEW_STYLES,
  SELF_REVIEW_NAME,
  STYLE_HINT,
  STYLE_NAME,
  tierOf,
  TIER_STYLE,
  type ReviewStyle,
  type SelfReviewSetting,
} from '../review/reviewStyle';
import type { GameReview, MoveLabel, MoveReview } from '../review/types';
import { saveReviewPrefs, useReviewPrefs } from '../settings/reviewPrefs';
import { MoveBadge } from './MoveBadge';
import { scrollWithin } from './scrollWithin';
import { useSan } from './useSan';

const TIER_GLYPH = { good: '✓', inaccuracy: '?!', bad: '?' } as const;

/** Learner's badge: three colours. Brilliant and Great keep their glyph, quietly, on the green. */
export function TierBadge({ label, size = 'sm' }: { label: MoveLabel; size?: 'sm' | 'md' }) {
  const tier = tierOf(label);
  const quiet = QUIET_LABELS.has(label);
  const glyph = quiet ? (label === 'Brilliant' ? '!!' : '!') : TIER_GLYPH[tier];
  const name = quiet ? label : TIER_STYLE[tier].name;
  const dim = size === 'md' ? 'h-6 w-6 text-[11px]' : 'h-4 w-4 text-[9px]';
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      data-tier={tier}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white ${dim}`}
      style={{ backgroundColor: TIER_STYLE[tier].color }}
    >
      {glyph}
    </span>
  );
}

/** The badge on the destination square of the current move, in the look of the style. */
export function SquareLabelBadge({ style, label }: { style: ReviewStyle; label: MoveLabel }) {
  if (style === 'learner') return <TierBadge label={label} size="md" />;
  if (style === 'analyst') {
    const nag = nagFor(label);
    if (!nag) return null;
    return (
      <span
        role="img"
        aria-label={label}
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono text-[11px] font-bold text-white shadow"
        style={{ backgroundColor: TIER_STYLE[tierOf(label)].color }}
      >
        {nag}
      </span>
    );
  }
  return <MoveBadge label={label} size="md" />;
}

/** Learner / Club / Analyst, switchable on the review screen (saved like the Settings choice). */
export function StyleSwitch({ style }: { style: ReviewStyle }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface p-1" role="group" aria-label="Review style" data-testid="review-style">
      {REVIEW_STYLES.map((s) => (
        <button
          key={s}
          aria-pressed={s === style}
          title={STYLE_HINT[s]}
          className={`rounded-md px-2 py-1 text-sm font-medium ${s === style ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}`}
          onClick={() => saveReviewPrefs({ style: s })}
        >
          {STYLE_NAME[s]}
        </button>
      ))}
    </div>
  );
}

type ListProps = {
  moves: MoveReview[];
  startFen: string;
  ply: number;
  onSelect: (ply: number) => void;
};

function rowsOf<T>(items: T[], startFen: string) {
  const blackFirst = startFen.split(' ')[1] === 'b';
  const firstMoveNo = Number(startFen.split(' ')[5]) || 1;
  const cells: (T | null)[] = [...items];
  if (blackFirst) cells.unshift(null);
  const rows: { no: number; white: T | null; black: T | null }[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push({ no: firstMoveNo + i / 2, white: cells[i], black: cells[i + 1] ?? null });
  return rows;
}

function moveTitle(m: MoveReview, fmt: (san: string) => string = (s) => s) {
  const no = Math.ceil(m.ply / 2);
  return m.color === 'w' ? `${no}. ${fmt(m.san)}` : `${no}... ${fmt(m.san)}`;
}

/** Learner's move list: three-colour badges; with `only`, just those moves (the key moments). */
export function LearnerMoveList({ moves, startFen, ply, onSelect, only }: ListProps & { only?: number[] }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const fmt = useSan();
  useEffect(() => {
    scrollWithin(activeRef.current);
  }, [ply]);

  const button = (m: MoveReview, text: string) => (
    <button
      ref={m.ply === ply ? activeRef : undefined}
      onClick={() => onSelect(m.ply)}
      aria-current={m.ply === ply ? 'true' : undefined}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-0.5 text-left font-mono text-sm ${
        m.ply === ply ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'
      }`}
    >
      <TierBadge label={m.label} />
      <span className="truncate">{text}</span>
    </button>
  );

  if (only) {
    const keyMoves = only.map((p) => moves[p - 1]).filter(Boolean);
    return (
      <div className="rounded-lg bg-surface p-2" data-testid="key-moments">
        {keyMoves.length === 0 ? (
          <p className="px-2 text-sm text-muted">No big swings in this game.</p>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {keyMoves.map((m) => (
              <li key={m.ply}>{button(m, moveTitle(m, fmt))}</li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg bg-surface p-2 lg:max-h-[20rem]" data-testid="review-move-list">
      <ol className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-y-0.5">
        {rowsOf(moves, startFen).map((r) => (
          <li key={r.no} className="contents">
            <span className="py-0.5 pr-1 text-right font-mono text-sm text-muted">{r.no}.</span>
            {r.white ? button(r.white, fmt(r.white.san)) : <span className="px-2 font-mono text-sm text-muted">…</span>}
            {r.black ? button(r.black, fmt(r.black.san)) : <span />}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Analyst's compact two-column list: SAN with its NAG and the eval after the move. */
export function AnalystMoveList({ review, startFen, ply, onSelect }: Omit<ListProps, 'moves'> & { review: GameReview }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const fmt = useSan();
  useEffect(() => {
    scrollWithin(activeRef.current);
  }, [ply]);

  const cell = (m: MoveReview | null) =>
    m ? (
      <button
        ref={m.ply === ply ? activeRef : undefined}
        onClick={() => onSelect(m.ply)}
        aria-current={m.ply === ply ? 'true' : undefined}
        aria-label={`${m.san}${nagFor(m.label)}`}
        className={`flex w-full min-w-0 items-baseline justify-between gap-1 rounded px-1.5 py-px text-left font-mono text-xs ${
          m.ply === ply ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'
        }`}
      >
        <span className="truncate">
          {fmt(m.san)}
          <span style={{ color: m.ply === ply ? undefined : nagFor(m.label) ? TIER_STYLE[tierOf(m.label)].color : undefined }}>
            {nagFor(m.label)}
          </span>
        </span>
        <span className={m.ply === ply ? '' : 'text-muted'}>{analystScore(review.positions[m.ply].score)}</span>
      </button>
    ) : (
      <span className="px-1.5 font-mono text-xs text-muted">…</span>
    );

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg bg-surface p-2 lg:max-h-[20rem]" data-testid="analyst-move-list">
      <ol className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-1 gap-y-px">
        {rowsOf(review.moves, startFen).map((r) => (
          <li key={r.no} className="contents">
            <span className="text-right font-mono text-xs text-muted">{r.no}.</span>
            {cell(r.white)}
            {r.black ? cell(r.black) : <span />}
          </li>
        ))}
      </ol>
    </div>
  );
}

const choice = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'}`;

/** Settings → Review: style (Auto from rating, or fixed), the self-review question, and the arrows. */
export function ReviewSettingsSection({ className }: { className: string }) {
  const prefs = useReviewPrefs();
  const styles: (ReviewStyle | null)[] = [null, ...REVIEW_STYLES];
  const selfReview: SelfReviewSetting[] = ['off', 'learner', 'always'];
  return (
    <section className={className} aria-labelledby="review-settings-heading" data-testid="review-settings">
      <h2 id="review-settings-heading" className="mb-1 font-semibold">Game Review</h2>
      <p className="mb-3 text-xs text-muted">How reviews look and what they ask first.</p>

      <div className="mb-1 text-sm text-muted">Review style</div>
      <div className="mb-1 flex flex-wrap gap-2" role="group" aria-label="Review style">
        {styles.map((s) => (
          <button key={s ?? 'auto'} aria-pressed={prefs.style === s} className={choice(prefs.style === s)} onClick={() => saveReviewPrefs({ style: s })}>
            {s ? STYLE_NAME[s] : 'Auto'}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted">
        {prefs.style ? STYLE_HINT[prefs.style] : 'From your rating when it is known: Learner under 1000, Club under 1900, else Analyst. Club otherwise.'}
      </p>

      <div className="mb-1 text-sm text-muted">“Where do you think it went wrong?” before the review</div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Self-review question">
        {selfReview.map((s) => (
          <button key={s} aria-pressed={prefs.selfReview === s} className={choice(prefs.selfReview === s)} onClick={() => saveReviewPrefs({ selfReview: s })}>
            {SELF_REVIEW_NAME[s]}
          </button>
        ))}
      </div>

      <div className="mb-1 text-sm text-muted">Arrows on the review board</div>
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={prefs.threatArrow} onChange={(e) => saveReviewPrefs({ threatArrow: e.target.checked })} />
          <span>Red: what the opponent's best reply does after a weak move</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={prefs.betterArrow} onChange={(e) => saveReviewPrefs({ betterArrow: e.target.checked })} />
          <span>Green: the better move</span>
        </label>
      </div>

      <div className="mt-4 mb-1 text-sm text-muted">Coach mascot</div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={prefs.coachMascot} onChange={(e) => saveReviewPrefs({ coachMascot: e.target.checked })} data-testid="coach-mascot" />
        <span>Rookie the rook says the coach lines in Review (only lines the board proves; never during a game)</span>
      </label>
      <label className="mt-1 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={prefs.coachAutoOpen} onChange={(e) => saveReviewPrefs({ coachAutoOpen: e.target.checked })} data-testid="coach-auto-open" />
        <span>Learner style: start the coach walkthrough when a review opens</span>
      </label>
    </section>
  );
}
