// "Your recent games" (decision docs/player-profile-2026-10/decision.md §2, §3): the habit profile under the Focus.
// Learner: one proven strength, the reassurance, the Focus sentence, no numbers. Club: clear lines with their n,
// leaning ones greyed. Analyst: every line with estimate, 90% interval, state, group and evidence links.
// No line has a training link: the Focus is the only action, and the line matching it says so.
import {
  clubLines,
  learnerView,
  lockedText,
  noFocusText,
  SECTION_TITLE,
  styleText,
  windowText,
  type PlayerProfile,
  type ProfileLine,
} from '../../insights/profile';
import type { Estimate } from '../../insights/stats';
import type { ReviewStyle } from '../../review/reviewStyle';
import { panel, Tag } from './parts';
import { bucketPlain, plural, shortDate } from './wording';

const STATE_NAME: Record<ProfileLine['state'], string> = { clear: 'clear', leaning: 'leaning', 'not-enough': 'not enough' };
const GROUP_NAME: Record<ProfileLine['group'], string> = { all: 'all opponents', 'human-like': 'people and Maia bots' };

function formatEstimate(l: ProfileLine): string {
  const f = (x: number) =>
    !Number.isFinite(x) ? '∞' : l.format === 'share' ? `${Math.round(x * 100)}%` : l.format === 'ratio' ? `${x.toFixed(1)}×` : x.toFixed(1);
  const e: Estimate = l.estimate;
  const unit = l.format === 'per100' ? ' per 100 moves' : '';
  const ref = l.reference !== undefined ? ` · compared with ${f(l.reference)}` : '';
  return `${f(e.value)} (90%: ${f(e.lo)}–${f(e.hi)})${unit}${ref}`;
}

export type ProfileSectionProps = {
  profile: PlayerProfile;
  style: ReviewStyle;
  /** Where an evidence position opens. */
  evidenceHref: (gameId: string, ply?: number) => string;
  /** Names a game for an evidence link ("vs Maia 1100 · 3 Oct"). */
  gameLabel?: (gameId: string, index: number) => string;
  /** Brings the Focus card into view; without it the Focus mark is plain text. */
  onShowFocus?: () => void;
  /** Coach view: "Their recent games", "This is their Focus". */
  coach?: { username: string };
};

export function ProfileSection({ profile, style, evidenceHref, gameLabel, onShowFocus, coach }: ProfileSectionProps) {
  const title = coach ? `${coach.username}’s recent games` : SECTION_TITLE;
  const focusWords = coach ? 'This is their Focus' : 'This is your Focus';
  return (
    <section className={panel} data-testid="profile-section" data-style={style} data-status={profile.status} aria-labelledby="profile-title">
      <h2 id="profile-title" className="font-semibold">
        {title}
      </h2>
      {profile.status === 'locked' ? (
        <p className="text-sm text-muted" data-testid="profile-locked">
          {lockedText(profile)}
        </p>
      ) : style === 'learner' ? (
        <LearnerBody profile={profile} onShowFocus={onShowFocus} />
      ) : (
        <>
          <p className="text-xs text-muted" data-testid="profile-window">
            {windowText(profile, shortDate)}
            {profile.groupNote && <> {profile.groupNote}</>}
          </p>
          {style === 'club' ? (
            <ClubBody profile={profile} focusWords={focusWords} onShowFocus={onShowFocus} />
          ) : (
            <AnalystBody profile={profile} focusWords={focusWords} onShowFocus={onShowFocus} evidenceHref={evidenceHref} gameLabel={gameLabel} />
          )}
          {!profile.focus.id && (
            <p className="text-sm text-muted" data-testid="profile-no-focus">
              {noFocusText(profile)}
            </p>
          )}
          <p className="text-xs text-muted" data-testid="profile-style-note">
            {styleText(profile)}
          </p>
        </>
      )}
      <p className="text-xs italic text-muted" data-testid="profile-closing">
        {profile.closing}
      </p>
    </section>
  );
}

function FocusMark({ words, onShowFocus }: { words: string; onShowFocus?: () => void }) {
  return onShowFocus ? (
    <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={onShowFocus} data-testid="profile-is-focus">
      {words} ↑
    </button>
  ) : (
    <span className="text-xs font-semibold text-accent" data-testid="profile-is-focus">
      {words}
    </span>
  );
}

function LearnerBody({ profile, onShowFocus }: { profile: PlayerProfile; onShowFocus?: () => void }) {
  const { strength, reassurance } = learnerView(profile);
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {strength && (
        <li data-testid="profile-strength">
          <span aria-hidden="true">✔ </span>
          {strength.plain}
        </li>
      )}
      {reassurance && <li data-testid="profile-reassurance">{reassurance.plain}</li>}
      <li data-testid="profile-focus-sentence">
        {profile.focus.id ? (
          <>
            Your Focus: {bucketPlain(profile.focus.id)}{' '}
            {onShowFocus && (
              <button type="button" className="text-accent hover:underline" onClick={onShowFocus}>
                See it above ↑
              </button>
            )}
          </>
        ) : (
          <span className="text-muted">{noFocusText(profile)}</span>
        )}
      </li>
    </ul>
  );
}

function ClubBody({ profile, focusWords, onShowFocus }: { profile: PlayerProfile; focusWords: string; onShowFocus?: () => void }) {
  const lines = clubLines(profile);
  if (lines.length === 0) return <p className="text-sm text-muted">Nothing clear enough to say yet. Keep playing and reviewing.</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {lines.map((l) => (
        <li
          key={l.id}
          className={l.state === 'leaning' ? 'text-muted' : ''}
          data-testid="profile-line"
          data-line={l.id}
          data-state={l.state}
        >
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{l.title}</span>
            {l.tone === 'strength' && <Tag tone="accent">strength</Tag>}
            {l.state === 'leaning' && <Tag>leaning</Tag>}
            {l.isFocus && <FocusMark words={focusWords} onShowFocus={onShowFocus} />}
          </p>
          <p>{l.text}</p>
          {l.note && <p className="text-xs text-muted">{l.note}</p>}
        </li>
      ))}
    </ul>
  );
}

function AnalystBody({
  profile,
  focusWords,
  onShowFocus,
  evidenceHref,
  gameLabel,
}: {
  profile: PlayerProfile;
  focusWords: string;
  onShowFocus?: () => void;
  evidenceHref: ProfileSectionProps['evidenceHref'];
  gameLabel?: ProfileSectionProps['gameLabel'];
}) {
  return (
    <>
      {profile.lines.length === 0 ? (
        <p className="text-sm text-muted">No line has passed its gate yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-2 text-sm" data-testid="profile-table">
          {profile.lines.map((l) => (
            <li key={l.id} className="flex flex-col gap-1 py-2" data-testid="profile-line" data-line={l.id} data-state={l.state}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{l.title}</span>
                <Tag tone={l.state === 'clear' ? 'accent' : 'muted'}>{STATE_NAME[l.state]}</Tag>
                {l.isFocus && <FocusMark words={focusWords} onShowFocus={onShowFocus} />}
              </p>
              <p className={l.state === 'leaning' ? 'text-muted' : ''}>{l.text}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted tabular-nums" data-testid="profile-numbers">
                <dt>Estimate</dt>
                <dd>{formatEstimate(l)}</dd>
                <dt>Group</dt>
                <dd>{GROUP_NAME[l.group]}</dd>
                <dt>n</dt>
                <dd>
                  {l.n} {l.unit}, {plural(l.games, 'game')}
                </dd>
              </dl>
              {l.detail && <p className="text-xs text-muted">{l.detail}</p>}
              {l.note && <p className="text-xs text-muted">{l.note}</p>}
              {l.evidence.length > 0 && (
                <p className="flex flex-wrap gap-x-3 text-xs" data-testid="profile-evidence">
                  {l.evidence.slice(0, 5).map((e, i) => (
                    <a key={`${e.gameId}:${e.ply ?? ''}`} className="text-accent hover:underline" href={evidenceHref(e.gameId, e.ply)}>
                      {gameLabel ? gameLabel(e.gameId, i) : `Game ${i + 1}`}
                      {e.ply !== undefined && `, move ${Math.ceil(e.ply / 2)}`}
                    </a>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {profile.waiting.length > 0 && (
        <div className="text-xs text-muted" data-testid="profile-waiting">
          <p className="font-semibold">Not shown yet</p>
          <ul className="flex flex-col gap-0.5">
            {profile.waiting.map((l) => (
              <li key={l.id}>
                {l.title}: {l.need ? `${l.need.have} of ${l.need.of} ${l.need.what}` : STATE_NAME[l.state]}.{l.note ? ` ${l.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
