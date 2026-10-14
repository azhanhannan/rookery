import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { api, ApiError } from '../api/client';
import type { GameSummary } from '../api/types';
import { CATEGORY_NAMES } from '../components/ratingCategory';
import { botColor } from '../game/rules';
import { loadHistory } from '../game/storage';
import type { Color, GameRecord } from '../game/types';

function message(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

/** Won/Lost/Draw for the player's side; the plain score for a game between two people at one screen. */
function resultLabel(g: GameSummary): string {
  if (g.result === '1/2-1/2') return g.userColor ? 'Draw' : '½-½';
  if (!g.userColor || g.result === '*') return g.result;
  const won = (g.result === '1-0') === (g.userColor === 'w');
  return won ? 'Won' : 'Lost';
}

/** "180+2" -> "3+2"; whole minutes where possible. */
function timeControlLabel(tc?: string): string {
  if (!tc) return 'Unlimited';
  const [base, inc] = tc.split('+').map(Number);
  if (!Number.isFinite(base)) return tc;
  const minutes = base % 60 === 0 ? String(base / 60) : (base / 60).toFixed(1);
  return `${minutes}+${Number.isFinite(inc) ? inc : 0}`;
}

/** The non-bot side when exactly one side is a bot; null otherwise. */
function uploadColor(record: GameRecord): Color | null {
  if (record.white.isBot === record.black.isBot) return null;
  const bot = botColor(record);
  return bot === 'w' ? 'b' : 'w';
}

function GameRow({ g }: { g: GameSummary }) {
  const result = resultLabel(g);
  const tone = result === 'Won' ? 'text-accent' : result === 'Lost' ? 'text-danger' : 'text-ink';
  return (
    <li>
      <a
        href={`#/review/${encodeURIComponent(g.clientId)}`}
        className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 hover:outline-1 hover:outline-accent"
        data-testid="game-row"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            <span className={tone}>{result}</span> <span className="text-muted">vs</span> {g.opponentName}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${g.rated ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink'}`}
            >
              {g.rated ? 'Rated' : 'Casual'}
              {g.category ? ` · ${CATEGORY_NAMES[g.category]}` : ''}
            </span>
            <span>{timeControlLabel(g.timeControl)}</span>
            <span>
              {g.moves} move{g.moves === 1 ? '' : 's'}
            </span>
            <span>{new Date(g.playedAt).toLocaleDateString()}</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted">{g.hasReview ? 'Reviewed' : ''}</span>
      </a>
    </li>
  );
}

function UploadLocal({ onDone }: { onDone: () => void }) {
  const [local] = useState(() => loadHistory().filter((g) => g.result !== '*'));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (local.length === 0) return null;

  async function upload() {
    setError(null);
    setOutcome(null);
    let failed = 0;
    let lastError = '';
    for (let i = 0; i < local.length; i++) {
      setProgress({ done: i + 1, total: local.length });
      const record = local[i];
      try {
        await api.saveGame({ record, userColor: uploadColor(record), rated: false });
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
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-3">
      <button
        className="self-start rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40"
        disabled={progress !== null}
        onClick={() => void upload()}
      >
        Upload games saved on this device
      </button>
      <p className="text-xs text-muted">
        {local.length} finished game{local.length === 1 ? '' : 's'} on this device. Games uploaded this way are always
        saved as casual: they never change your rating.
      </p>
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

export function GamesPage() {
  const status = useAuthStore((s) => s.status);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listGames(before);
      setGames((prev) => (before ? [...prev, ...page.games.filter((g) => !prev.some((p) => p.clientId === g.clientId))] : page.games));
      setNextBefore(page.nextBefore);
      setLoaded(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'signed-in') void load();
  }, [status, load]);

  let body: React.ReactNode;
  if (status === 'unknown') {
    body = <p className="text-sm text-muted">Loading…</p>;
  } else if (status === 'offline') {
    body = (
      <p role="alert" className="text-sm text-danger">
        Can't reach the server. Your games are still saved on this device:{' '}
        <a className="text-accent underline" href="#/review/games">review them here</a>.
      </p>
    );
  } else if (status === 'signed-out') {
    body = (
      <p className="rounded-lg bg-surface p-3 text-sm">
        <a className="text-accent underline" href="#/login">Log in</a> to see the games saved to your account.
      </p>
    );
  } else {
    body = (
      <>
        <UploadLocal onDone={() => void load()} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {loaded && games.length === 0 ? (
          <p className="rounded-lg bg-surface p-3 text-sm">
            No saved games yet. <a className="text-accent underline" href="#/play">Play one</a> while signed in and it is
            saved here when it ends.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="games-list">
            {games.map((g) => (
              <GameRow key={g.clientId} g={g} />
            ))}
          </ul>
        )}
        {loading && <p className="text-sm text-muted">Loading games…</p>}
        {nextBefore && !loading && (
          <button
            className="self-center rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium hover:outline-1 hover:outline-accent"
            onClick={() => void load(nextBefore)}
          >
            Load more
          </button>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-6">
      <h1 className="text-xl font-bold">My games</h1>
      {body}
    </div>
  );
}
