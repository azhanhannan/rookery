import { useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { BatchReviewPanel } from '../components/BatchReviewPanel';
import { ReReviewOffer } from '../components/ReReviewOffer';
import { REVIEW } from '../config/tunables';
import { useGameStore } from '../game/gameStore';
import {
  isLichessUsername,
  LICHESS_COUNTS,
  LICHESS_SPEEDS,
  lichessGamesUrl,
  type LichessSpeed,
} from '../game/importBatch';
import { splitPgn } from '../game/pgnSplit';
import { useBatchReview } from './batchReview';
import { fetchLichessPgn, importGames, type ImportSummary } from './bulkImport';

const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
const primary = 'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40';
const field = 'rounded-lg border border-surface-2 bg-surface px-3 py-2 text-sm outline-accent';

const SPEED_NAMES: Record<LichessSpeed, string> = {
  any: 'Any speed',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
};

type Busy = { what: string; done: number; total: number | null };

function isAbort(e: unknown): boolean {
  return e instanceof Error || e instanceof DOMException ? e.name === 'AbortError' : false;
}

function Summary({ summary, onReviewAll }: { summary: ImportSummary; onReviewAll: () => void }) {
  const batch = useBatchReview((s) => s.status);
  const n = summary.imported;
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm" data-testid="import-summary" aria-label="Import summary">
      <p role="status">
        <span className="font-semibold">{n} imported</span>
        {` · ${summary.duplicates} duplicate${summary.duplicates === 1 ? '' : 's'} skipped · ${summary.failed.length} failed`}
      </p>
      {n > 0 && (
        <p className="text-xs text-muted">
          {summary.player
            ? `Played as "${summary.player}" where that name appears.`
            : "Couldn't tell which side you played, so these games show both players' names."}
        </p>
      )}
      {summary.failed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted">Why some failed</summary>
          <ul className="mt-1 list-inside list-disc text-xs text-muted" data-testid="import-failures">
            {summary.failed.map((f, i) => (
              <li key={i}>{f.label}: {f.reason}</li>
            ))}
          </ul>
        </details>
      )}
      {n > 0 && (
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={batch === 'running'} onClick={onReviewAll}>
            Review all {n}
          </button>
          <a className={btn} href="#/games">See them in My games</a>
        </div>
      )}
    </section>
  );
}

export function ImportPage() {
  const importPgn = useGameStore((s) => s.importPgn);
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const startBatch = useBatchReview((s) => s.start);
  const [text, setText] = useState('');
  const [player, setPlayer] = useState('');
  const [side, setSide] = useState<'w' | 'b' | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [lichessUser, setLichessUser] = useState('');
  const [count, setCount] = useState<number>(LICHESS_COUNTS[1]);
  const [speed, setSpeed] = useState<LichessSpeed>('any');
  const [busy, setBusy] = useState<Busy | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const abort = useRef<AbortController | null>(null);

  const gameCount = useMemo(() => (text.trim() ? splitPgn(text).length : 0), [text]);

  async function runBulk(texts: string[], name: string | undefined, ctrl: AbortController) {
    setBusy({ what: 'Importing', done: 0, total: texts.length });
    const result = await importGames(texts, {
      player: name,
      signal: ctrl.signal,
      onProgress: (p) => setBusy({ what: 'Importing', done: p.done, total: p.total }),
    });
    setSummary(result);
  }

  async function guarded(work: (ctrl: AbortController) => Promise<void>) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setSummary(null);
    try {
      await work(ctrl);
    } catch (e) {
      setError(isAbort(e) ? 'Cancelled. Nothing was imported.' : e instanceof Error ? e.message : String(e));
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setBusy(null);
    }
  }

  function submit() {
    const games = splitPgn(text);
    if (games.length <= 1) {
      // One game: as before, it goes on the board (and into history when finished).
      try {
        importPgn(text, side || undefined);
        location.hash = '#/play';
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    void guarded((ctrl) => runBulk(games, player.trim() || undefined, ctrl));
  }

  function fromLichess() {
    const name = lichessUser.trim();
    if (!isLichessUsername(name)) {
      setError('Enter a Lichess username (letters, digits, "_" or "-").');
      return;
    }
    void guarded(async (ctrl) => {
      setBusy({ what: 'Downloading from Lichess', done: 0, total: count });
      const pgn = await fetchLichessPgn(lichessGamesUrl(name, count, speed), name, ctrl.signal, (n) =>
        setBusy({ what: 'Downloading from Lichess', done: n, total: count }),
      );
      const games = splitPgn(pgn);
      if (games.length === 0) throw new Error(`No ${speed === 'any' ? '' : SPEED_NAMES[speed].toLowerCase() + ' '}games found for "${name}" on Lichess.`);
      await runBulk(games, name, ctrl);
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const texts = await Promise.all([...files].map((f) => f.text()));
      setText(texts.map((t) => t.trim()).join('\n\n'));
      setError(null);
      setSummary(null);
    } catch (e) {
      setError(`Couldn't read that file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const pct = busy?.total ? Math.min(100, Math.round((busy.done / busy.total) * 100)) : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <section>
        <h1 className="mb-1 text-xl font-semibold">Import games</h1>
        <p className="mb-4 text-sm text-muted">
          Paste PGN or open a .pgn file. One game replaces the game on the board (a finished one is also saved to
          your history); several games are all saved to your history.
          {signedIn && ' Signed in, they are saved to your account too, as casual games.'}
        </p>
        <textarea
          aria-label="PGN"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          rows={14}
          placeholder={'[Event "Casual game"]\n[White "Ana"]\n[Black "Ben"]\n\n1. e4 e5 2. Nf3 Nc6 *'}
          className="w-full rounded-lg border border-surface-2 bg-surface p-3 font-mono text-sm outline-accent"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label className={`${btn} cursor-pointer`}>
            Open .pgn file
            <input
              type="file"
              accept=".pgn,application/x-chess-pgn,text/plain"
              multiple
              className="sr-only"
              aria-label="Game file"
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          {gameCount > 1 && <span className="text-muted" data-testid="pgn-count">{gameCount} games</span>}
        </div>
        {gameCount > 1 && (
          <label className="mt-2 flex flex-col gap-1 text-sm">
            <span>Your name in these games <span className="text-muted">(optional: found automatically when one name is in every game)</span></span>
            <input className={field} value={player} onChange={(e) => setPlayer(e.target.value)} aria-label="Your name in these games" />
          </label>
        )}
        {gameCount <= 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="I played">
            <span>I played</span>
            {([['w', 'White'], ['b', 'Black'], ['', 'Neither / not sure']] as const).map(([v, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={side === v}
                onClick={() => setSide(v)}
                className={`rounded-lg px-3 py-1 ${side === v ? 'bg-accent text-white' : 'bg-surface-2 hover:bg-surface'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button className={primary} disabled={!text.trim() || busy !== null} onClick={submit}>
            {gameCount > 1 ? `Import ${gameCount} games` : 'Import'}
          </button>
          <a href="#/play" className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">Cancel</a>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-surface-2 p-3" aria-label="From Lichess">
        <h2 className="font-semibold">From Lichess</h2>
        <p className="text-xs text-muted">Downloads a player's latest finished games straight from lichess.org.</p>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${field} min-w-0 flex-1`}
            placeholder="Lichess username"
            aria-label="Lichess username"
            value={lichessUser}
            onChange={(e) => {
              setLichessUser(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) fromLichess();
            }}
          />
          <select className={field} aria-label="How many games" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {LICHESS_COUNTS.map((n) => (
              <option key={n} value={n}>Last {n}</option>
            ))}
          </select>
          <select className={field} aria-label="Speed" value={speed} onChange={(e) => setSpeed(e.target.value as LichessSpeed)}>
            {LICHESS_SPEEDS.map((s) => (
              <option key={s} value={s}>{SPEED_NAMES[s]}</option>
            ))}
          </select>
          <button className={primary} disabled={!lichessUser.trim() || busy !== null} onClick={fromLichess}>
            Fetch games
          </button>
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {busy && (
        <section className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="import-progress">
          <div className="flex items-baseline justify-between text-sm">
            <span>
              {busy.what}… {busy.done}
              {busy.total ? ` of ${busy.total}` : ''}
            </span>
            {busy.total ? <span className="font-mono text-muted">{pct}%</span> : null}
          </div>
          <div className="h-2 overflow-hidden rounded bg-surface-2" role="progressbar" aria-label="Import progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <button className={btn} onClick={() => abort.current?.abort()}>Cancel</button>
        </section>
      )}

      {summary && <Summary summary={summary} onReviewAll={() => startBatch(summary.importedIds, REVIEW.depth.normal)} />}
      <BatchReviewPanel />
      <ReReviewOffer />
    </div>
  );
}
