import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../account/authStore';
import {
  endedText,
  fullMoves,
  groupByDay,
  matchesFilter,
  outcomeOf,
  personColor,
  resultLabel,
  statsOf,
  summaryFromRecord,
  timeControlLabel,
} from '../account/gamesList';
import { api, ApiError } from '../api/client';
import { GAME_FILTERS, type GameFilter, type GameStats, type GameSummary } from '../api/types';
import { MiniBoard } from '../components/MiniBoard';
import { CATEGORY_NAMES } from '../components/ratingCategory';
import { loadHistory } from '../game/storage';
import type { GameRecord } from '../game/types';
import { PracticeTag } from '../components/PracticePanel';
import { practiceIdsOnDevice } from '../game/practice';
import { usePlaySettings } from '../settings/playSettings';
import { BatchReviewPanel } from '../components/BatchReviewPanel';
import { ReReviewOffer } from '../components/ReReviewOffer';
import { useBatchReview } from './batchReview';
import { OpeningsReport, type OpeningPick } from './OpeningsReport';

function message(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

const FILTER_NAMES: Record<GameFilter, string> = {
  all: 'All',
  won: 'Won',
  lost: 'Lost',
  drawn: 'Draws',
  rated: 'Rated',
  casual: 'Casual',
};

const OUTCOME_STYLE = {
  won: 'bg-accent text-accent-ink',
  lost: 'bg-danger text-white',
  drawn: 'bg-surface-2 text-ink',
  none: 'bg-surface-2 text-ink',
};

const localFinished = () => loadHistory().filter((g) => g.result !== '*');

function Stats({ stats }: { stats: GameStats }) {
  const decided = stats.won + stats.lost + stats.drawn;
  const pct = (n: number) => (decided ? (n / decided) * 100 : 0);
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="games-stats" aria-label="Your record">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">
          <span className="font-mono text-lg font-bold text-ink">{stats.total}</span> game{stats.total === 1 ? '' : 's'}
        </span>
        {decided > 0 && (
          <span className="text-sm text-muted">
            Win rate <span className="font-mono font-semibold text-ink">{Math.round(pct(stats.won))}%</span>
          </span>
        )}
      </div>
      {decided > 0 && (
        <>
          <div className="flex h-2 overflow-hidden rounded bg-surface-2" aria-hidden>
            <div className="bg-accent" style={{ width: `${pct(stats.won)}%` }} />
            <div className="bg-muted opacity-50" style={{ width: `${pct(stats.drawn)}%` }} />
            <div className="bg-danger" style={{ width: `${pct(stats.lost)}%` }} />
          </div>
          <div className="flex gap-4 text-xs">
            <span><span className="font-mono font-semibold text-accent">{stats.won}</span> won</span>
            <span><span className="font-mono font-semibold">{stats.drawn}</span> drawn</span>
            <span><span className="font-mono font-semibold text-danger">{stats.lost}</span> lost</span>
          </div>
        </>
      )}
    </section>
  );
}

function Filters({ value, onChange }: { value: GameFilter; onChange: (f: GameFilter) => void }) {
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
      {GAME_FILTERS.map((f) => (
        <button
          key={f}
          aria-pressed={value === f}
          onClick={() => onChange(f)}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            value === f ? 'bg-accent text-accent-ink' : 'bg-surface hover:outline-1 hover:outline-accent'
          }`}
        >
          {FILTER_NAMES[f]}
        </button>
      ))}
    </div>
  );
}

function GameRow({ g, practice = false }: { g: GameSummary; practice?: boolean }) {
  const outcome = outcomeOf(g);
  const ended = endedText(g.termination);
  const time = new Date(g.playedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  // Settings → Play "Hide ratings" leaves the rating change out.
  const delta = usePlaySettings().hideRating ? undefined : g.ratingDelta;
  return (
    <li>
      <a
        href={`#/review/${encodeURIComponent(g.clientId)}`}
        className="flex items-center gap-3 rounded-lg bg-surface p-2.5 hover:outline-1 hover:outline-accent"
        data-testid="game-row"
      >
        <MiniBoard fen={g.finalFen} orientation={g.userColor ?? 'w'} size={60} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${OUTCOME_STYLE[outcome]}`}>{resultLabel(g)}</span>
            <span className="min-w-0 truncate font-semibold">
              <span className="font-normal text-muted">vs</span> {g.opponentName}
            </span>
          </span>
          <span className="mt-1 block truncate text-xs text-muted">
            {g.userColor && (
              <>
                <span
                  className={`mr-1 inline-block h-2 w-2 rounded-full border border-muted align-middle ${
                    g.userColor === 'w' ? 'bg-neutral-100' : 'bg-neutral-800'
                  }`}
                  aria-hidden
                />
                {g.userColor === 'w' ? 'White' : 'Black'} ·{' '}
              </>
            )}
            {ended && `${ended} · `}
            {fullMoves(g.moves)} move{fullMoves(g.moves) === 1 ? '' : 's'}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {practice && !g.rated ? (
              <PracticeTag />
            ) : (
              <span className={g.rated ? 'font-medium text-ink' : ''}>
                {g.rated ? 'Rated' : 'Casual'}
                {g.category ? ` · ${CATEGORY_NAMES[g.category]}` : ''}
              </span>
            )}
            <span>{timeControlLabel(g.timeControl)}</span>
            <span>{time}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
          {delta !== undefined && (
            <span
              className={`font-mono font-semibold ${delta > 0 ? 'text-accent' : delta < 0 ? 'text-danger' : 'text-muted'}`}
              data-testid="rating-delta"
              title="Rating change"
            >
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
          <span className={g.hasReview ? 'text-muted' : 'font-medium text-accent'}>{g.hasReview ? 'Reviewed' : 'Review →'}</span>
        </span>
      </a>
    </li>
  );
}

function GameList({ games }: { games: GameSummary[] }) {
  const groups = useMemo(() => groupByDay(games), [games]);
  // The server's summaries don't carry the practice flag; the games saved on this device do.
  const practiceIds = useMemo(() => practiceIdsOnDevice(games.map((g) => g.clientId)), [games]);
  return (
    <div className="flex flex-col gap-4" data-testid="games-list">
      {groups.map((group) => (
        <section key={group.label + group.games[0].clientId} aria-label={group.label}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</h2>
          <ul className="flex flex-col gap-2">
            {group.games.map((g) => (
              <GameRow key={g.clientId} g={g} practice={practiceIds.has(g.clientId)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function UploadLocal({ local, onDone }: { local: GameRecord[]; onDone: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (local.length === 0 && !outcome && !error) return null;

  async function upload() {
    setError(null);
    setOutcome(null);
    let failed = 0;
    let lastError = '';
    for (let i = 0; i < local.length; i++) {
      setProgress({ done: i + 1, total: local.length });
      const record = local[i];
      try {
        await api.saveGame({ record, userColor: personColor(record), rated: false });
      } catch (e) {
        // Unreachable server: stop rather than fail every remaining game the same way.
        if (e instanceof ApiError && e.status === 0) {
          setProgress(null);
          setError(e.message);
          onDone();
          return;
        }
        failed++;
        lastError = message(e);
      }
    }
    setProgress(null);
    const ok = local.length - failed;
    setOutcome(`Uploaded ${ok} of ${local.length} game${local.length === 1 ? '' : 's'}.`);
    if (failed) setError(`${failed} game${failed === 1 ? '' : 's'} could not be uploaded: ${lastError}`);
    onDone();
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-surface-2 p-3" data-testid="upload-local">
      {local.length > 0 && (
        <>
          <p className="text-sm">
            {local.length} finished game{local.length === 1 ? ' is' : 's are'} on this device but not in your account.
          </p>
          <button
            className="self-start rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40"
            disabled={progress !== null}
            onClick={() => void upload()}
          >
            Upload {local.length === 1 ? 'it' : 'them'}
          </button>
          <p className="text-xs text-muted">Uploaded games are saved as casual: they never change your rating.</p>
        </>
      )}
      {progress && (
        <p className="text-sm" role="status">
          Uploading {progress.done} of {progress.total}…
        </p>
      )}
      {outcome && <p className="text-sm" role="status">{outcome}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Signed out or offline: the games saved in this browser, filtered and counted here. */
function LocalGames({ note }: { note: React.ReactNode }) {
  const [filter, setFilter] = useState<GameFilter>('all');
  // A background "Review all" run saves reviews while this page is open: re-read after each one.
  const reviewedInBatch = useBatchReview((s) => s.reviewed);
  const all = useMemo(
    () =>
      localFinished()
        .map(summaryFromRecord)
        .sort((a, b) => b.playedAt.localeCompare(a.playedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read storage after each review
    [reviewedInBatch],
  );
  const shown = all.filter((g) => matchesFilter(g, filter));
  return (
    <>
      {note}
      {all.length > 0 && <Stats stats={statsOf(all)} />}
      {all.length > 0 && <Filters value={filter} onChange={setFilter} />}
      {all.length === 0 ? (
        <p className="rounded-lg bg-surface p-3 text-sm">
          No finished games on this device yet. <a className="text-accent underline" href="#/play">Play one</a>.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">No games match this filter.</p>
      ) : (
        <GameList games={shown} />
      )}
    </>
  );
}

function AccountGames() {
  const [filter, setFilter] = useState<GameFilter>('all');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notUploaded, setNotUploaded] = useState<GameRecord[]>([]);

  const load = useCallback(async (f: GameFilter, before?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listGames(before, f);
      setGames((prev) => (before ? [...prev, ...page.games.filter((g) => !prev.some((p) => p.clientId === g.clientId))] : page.games));
      setNextBefore(page.nextBefore);
      if (page.stats) setStats(page.stats);
      setLoaded(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const checkLocal = useCallback(async () => {
    const local = localFinished();
    if (local.length === 0) return setNotUploaded([]);
    try {
      const { clientIds } = await api.gameIds();
      const saved = new Set(clientIds);
      setNotUploaded(local.filter((g) => !saved.has(g.id)));
    } catch {
      setNotUploaded([]);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);
  useEffect(() => {
    void checkLocal();
  }, [checkLocal]);

  return (
    <>
      {stats && stats.total > 0 && <Stats stats={stats} />}
      {stats && stats.total > 0 && <Filters value={filter} onChange={setFilter} />}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {loaded && games.length === 0 ? (
        stats && stats.total > 0 ? (
          <p className="text-sm text-muted">No games match this filter.</p>
        ) : (
          <p className="rounded-lg bg-surface p-3 text-sm">
            No saved games yet. <a className="text-accent underline" href="#/play">Play one</a> while signed in and it is
            saved here when it ends.
          </p>
        )
      ) : (
        <GameList games={games} />
      )}
      {loading && <p className="text-sm text-muted">Loading games…</p>}
      {nextBefore && !loading && (
        <button
          className="self-center rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium hover:outline-1 hover:outline-accent"
          onClick={() => void load(filter, nextBefore)}
        >
          Load more
        </button>
      )}
      <UploadLocal
        local={notUploaded}
        onDone={() => {
          void load(filter);
          void checkLocal();
        }}
      />
    </>
  );
}

/** The games of one row of the Openings report (they come from this device, like the report). */
function OpeningGames({ pick, onClear }: { pick: OpeningPick; onClear: () => void }) {
  const games = useMemo(() => {
    const ids = new Set(pick.ids);
    return localFinished()
      .filter((g) => ids.has(g.id))
      .map(summaryFromRecord)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  }, [pick]);
  return (
    <>
      <div className="flex items-center gap-2 self-start rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-ink" data-testid="opening-filter">
        {pick.name} · as {pick.color === 'w' ? 'White' : 'Black'}
        <button aria-label="Clear opening filter" className="font-bold" onClick={onClear}>×</button>
      </div>
      {games.length === 0 ? <p className="text-sm text-muted">These games are no longer on this device.</p> : <GameList games={games} />}
    </>
  );
}

type GamesTab = 'games' | 'openings';

export function GamesPage() {
  const status = useAuthStore((s) => s.status);
  const [tab, setTab] = useState<GamesTab>('games');
  const [pick, setPick] = useState<OpeningPick | null>(null);

  let body: React.ReactNode;
  if (status === 'unknown') {
    body = <p className="text-sm text-muted">Loading…</p>;
  } else if (status === 'offline') {
    body = (
      <LocalGames
        note={
          <p role="alert" className="text-sm text-danger">
            Can't reach the server, so these are the games saved on this device.
          </p>
        }
      />
    );
  } else if (status === 'signed-out') {
    body = (
      <LocalGames
        note={
          <p className="rounded-lg bg-surface p-3 text-sm">
            These games are saved in this browser only.{' '}
            <a className="text-accent underline" href="#/login">Log in</a> to keep them in your account and get a rating.
          </p>
        }
      />
    );
  } else {
    body = <AccountGames />;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold">My games</h1>
        <a className="text-sm font-medium text-accent hover:underline" href="#/play">
          Play →
        </a>
      </div>
      <div role="tablist" aria-label="My games view" className="flex gap-1 border-b border-surface-2">
        {(['games', 'openings'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t === 'games' ? 'Games' : 'Openings'}
          </button>
        ))}
      </div>
      <BatchReviewPanel />
      <ReReviewOffer />
      {tab === 'openings' && status !== 'unknown' ? (
        <OpeningsReport
          signedIn={status === 'signed-in'}
          onPick={(p) => {
            setPick(p);
            setTab('games');
          }}
        />
      ) : pick ? (
        <OpeningGames pick={pick} onClear={() => setPick(null)} />
      ) : (
        body
      )}
    </div>
  );
}
