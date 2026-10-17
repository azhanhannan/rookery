import { useEffect, useMemo, useState } from 'react';
import { pickAccountRating, useAccountRatings } from '../account/accountRating';
import { useAuthStore } from '../account/authStore';
import { MascotSays } from '../components/RookMascot';
import { loadProgress } from '../endgames/progress';
import { loadHistory } from '../game/storage';
import { buildInsights, focusStatus } from '../insights';
import type { LedgerBucket, OpponentType, Speed } from '../insights/types';
import { loadLessonsProgress } from '../lessons/progress';
import { harvestMistakes } from '../puzzles/harvest';
import { loadSchedule } from '../puzzles/spacedRepetition';
import { effectiveStyle, STYLE_NAME, type ReviewStyle } from '../review/reviewStyle';
import { useReviewPrefs } from '../settings/reviewPrefs';
import { loadTrainingLog } from '../training/trainingLog';
import { useBatchReview } from './batchReview';
import { ActiveFocus, FocusProposal } from './insights/FocusCard';
import { activeFocus, beginFocus, finishFocus, loadFocus, type StoredFocus } from './insights/focusStore';
import { loadInsightFacts, type LoadedFacts } from './insights/loadFacts';
import { AfterLossView, BucketCard, ClockView, EpisodesView, LedgerTable, OpeningsView, panel, PhaseRates, Tag } from './insights/parts';
import { mistakesForMotif, processMeasures } from './insights/process';
import { plural, SPEED_NAME } from './insights/wording';

const EXCLUDED_NAME: Record<string, string> = {
  'no-side': 'no side to call yours',
  unfinished: 'unfinished',
  practice: 'practice or takebacks',
  unreviewed: 'not reviewed',
  'shallow-review': 'reviewed below depth 16',
  'too-short': 'fewer than 10 of your moves',
};

/** The Review style in force away from a game: the saved choice, or Auto from the account's rating. */
function useInsightsStyle(): ReviewStyle {
  const prefs = useReviewPrefs();
  const rows = useAccountRatings();
  return effectiveStyle(prefs.style, pickAccountRating(rows));
}

/** `#/insights`: where your games are decided, from your reviewed games; one Focus at a time. */
export function InsightsPage() {
  const style = useInsightsStyle();
  const username = useAuthStore((s) => (s.status === 'signed-in' ? (s.user?.username ?? null) : null));
  const reviewedInBatch = useBatchReview((s) => s.reviewed);
  const [loaded, setLoaded] = useState<LoadedFacts | null>(null);
  const [speed, setSpeed] = useState<Speed | 'all'>('all');
  const [opponent, setOpponent] = useState<OpponentType | 'all'>('all');
  const [stored, setStored] = useState<StoredFocus | null>(loadFocus);
  const [showAfterLoss, setShowAfterLoss] = useState(false);

  useEffect(() => {
    let live = true;
    // SEAM: pass `serverSource` here once the server serves facts for games not on this device.
    void loadInsightFacts({ userNames: username ? [username] : [] }).then((r) => live && setLoaded(r));
    return () => {
      live = false;
    };
  }, [username, reviewedInBatch]);

  const now = useMemo(() => new Date(), [loaded, stored]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(
    () => (loaded ? buildInsights(loaded.facts, { style, speed, opponent, now, history: loaded.history, coverage: loaded.coverage }) : null),
    [loaded, style, speed, opponent, now],
  );
  const factsById = useMemo(() => new Map((loaded?.facts ?? []).map((f) => [f.gameId, f])), [loaded]);
  const focus = activeFocus(stored);
  const status = useMemo(() => (focus && loaded ? focusStatus(focus, loaded.facts, now) : null), [focus, loaded, now]);
  const records = useMemo(() => loadHistory(), [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusBucket = useMemo<LedgerBucket | null>(
    () => (focus && model ? ([...model.ledger.cells, ...model.ledger.overlays].find((b) => b.id === focus.bucketId) ?? null) : null),
    [focus, model],
  );
  const process = useMemo(() => {
    if (!focus) return null;
    const motif = focusBucket?.motif;
    const mistakes = motif && motif !== 'other' ? mistakesForMotif(harvestMistakes(records, { userNames: username ? [username] : [] }), records, motif) : null;
    return processMeasures({
      startedAt: focus.startedAt,
      motif,
      train: focusBucket?.train,
      log: loadTrainingLog(),
      schedule: loadSchedule(),
      mistakes,
      lessons: loadLessonsProgress(),
      endgames: loadProgress(),
    });
  }, [focus, focusBucket, records, username]);

  if (!loaded || !model) return <p className="p-6 text-center text-sm text-muted">Reading your reviewed games…</p>;

  const filtered = speed !== 'all' || opponent !== 'all';
  const cov = loaded.coverage;
  const excluded = Object.entries(cov.excluded).filter(([, n]) => (n ?? 0) > 0);
  const speeds = [...new Set(loaded.facts.map((f) => f.speed))].sort();
  const extraCards = model.cards.filter((c) => c.role !== 'focus' && c.bucket.id !== focus?.bucketId);
  const proposal = model.focus && model.focus.id !== focus?.bucketId ? model.focus : null;

  function start(bucket: LedgerBucket) {
    if (!loaded) return;
    setStored(beginFocus(loaded.facts, bucket.id));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6" data-testid="insights-page" data-style={style}>
      <div>
        <h1 className="text-xl font-bold">Insights</h1>
        <p className="text-sm text-muted">
          Where your games are decided, from your reviewed games. One thing to work on at a time.
        </p>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted" data-testid="insights-coverage">
        <p>
          Reviewed and counted: <span className="font-semibold text-ink">{cov.included}</span> of {plural(cov.total, 'saved game')}
          {model.status === 'early' && (
            <>
              {' '}
              <Tag>early read</Tag>
            </>
          )}
          {' · '}Review style: {STYLE_NAME[style]} (<a className="text-accent hover:underline" href="#/account">change</a>)
        </p>
        {excluded.length > 0 && style !== 'learner' && (
          <p>Left out: {excluded.map(([why, n]) => `${n} ${EXCLUDED_NAME[why] ?? why}`).join(', ')}.</p>
        )}
      </div>

      {loaded.facts.length > 0 && style !== 'learner' && (
        <div className="flex flex-wrap gap-2 text-sm" data-testid="insights-filters">
          <label className="flex items-center gap-1">
            <span className="text-muted">Speed</span>
            <select className="rounded bg-surface-2 px-2 py-1" value={speed} onChange={(e) => setSpeed(e.target.value as Speed | 'all')} data-testid="filter-speed">
              <option value="all">{SPEED_NAME.all}</option>
              {speeds.map((s) => (
                <option key={s} value={s}>
                  {SPEED_NAME[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted">Opponents</span>
            <select className="rounded bg-surface-2 px-2 py-1" value={opponent} onChange={(e) => setOpponent(e.target.value as OpponentType | 'all')} data-testid="filter-opponent">
              <option value="all">People and bots</option>
              <option value="human">People</option>
              <option value="bot">Bots</option>
            </select>
          </label>
          {filtered && <span className="self-center text-xs text-muted">{plural(model.games, 'game')} match</span>}
        </div>
      )}

      {focus && status && process ? (
        <ActiveFocus
          focus={focus}
          status={status}
          bucket={focusBucket}
          style={style}
          process={process}
          facts={factsById}
          proposal={model.status === 'locked' ? null : proposal}
          onEnd={(reason) => setStored(finishFocus(focus, reason))}
          onSwap={(b) => {
            finishFocus(focus, 'swap');
            start(b);
          }}
        />
      ) : null}

      {model.status === 'locked' ? (
        <div className={panel} data-testid="insights-gate">
          <MascotSays>
            {filtered
              ? `Only ${plural(model.games, 'reviewed game')} match these filters. I need ${model.needGames} more to say anything useful.`
              : `Review ${model.needGames} more game${model.needGames === 1 ? '' : 's'} and I’ll show you where your games are decided.`}
          </MascotSays>
          <div className="flex flex-wrap gap-3 text-sm">
            <a className="font-semibold text-accent hover:underline" href="#/import" data-testid="gate-review-all">
              Review all
            </a>
            <a className="text-accent hover:underline" href="#/review/games">
              Review one game
            </a>
          </div>
        </div>
      ) : (
        <>
          {!focus &&
            (model.focus ? (
              <FocusProposal bucket={model.focus} style={style} games={model.games} facts={factsById} onStart={() => start(model.focus!)} />
            ) : (
              <div className={panel} data-testid="focus-none">
                <MascotSays>
                  {model.games < 20
                    ? `I pick a focus once you have 20 reviewed games (you have ${model.games}). Keep reviewing!`
                    : 'Nothing stands out clearly enough to be worth weeks of training yet. Keep playing and reviewing.'}
                </MascotSays>
              </div>
            ))}

          {style === 'club' &&
            extraCards.slice(0, 1).map((c) => <BucketCard key={c.bucket.id} bucket={c.bucket} role="watch" facts={factsById} trend={c.trend} />)}

          {style === 'analyst' && (
            <>
              {extraCards.map((c) => (
                <BucketCard key={c.bucket.id} bucket={c.bucket} role="card" facts={factsById} trend={c.trend} />
              ))}
              <LedgerTable ledger={model.ledger} />
              <PhaseRates rates={model.phaseRates} />
              <ClockView clock={model.clock} />
              <EpisodesView conversion={model.conversion} saves={model.saves} />
              <OpeningsView rows={model.openings} />
              <section className={panel}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showAfterLoss} onChange={(e) => setShowAfterLoss(e.target.checked)} data-testid="after-loss-toggle" />
                  Show how the game after a loss goes
                </label>
                {showAfterLoss && <AfterLossView line={model.afterLoss} />}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
