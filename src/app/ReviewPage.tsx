import { useEffect, useState } from 'react';
import { useAuthStore } from '../account/authStore';
import { api, ApiError } from '../api/client';
import { REVIEW } from '../config/tunables';
import { ReviewRunPanel } from '../components/ReviewRunPanel';
import { useGameStore } from '../game/gameStore';
import { describeEnd } from '../game/rules';
import { findArchivedGame, loadHistory, updateArchivedGame } from '../game/storage';
import type { GameRecord } from '../game/types';
import { nextDepth, reviewableGames, reviewFits } from '../review/reviewView';
import { recordTrainedDay } from '../puzzles/streak';
import { ReviewScreen } from './ReviewScreen';
import { useReviewRun } from './useReviewRun';

function gameTitle(g: GameRecord) {
  return `${g.white.name} vs ${g.black.name}`;
}

function GamePicker({ intro }: { intro: string }) {
  const games = reviewableGames(useGameStore.getState().record, loadHistory());
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-6">
      <h1 className="text-xl font-bold">Game Review</h1>
      <p className="text-sm text-muted">{intro}</p>
      {games.length === 0 ? (
        <p className="rounded-lg bg-surface p-3 text-sm">
          No finished games yet. <a className="text-accent underline" href="#/play">Play one</a> or{' '}
          <a className="text-accent underline" href="#/import">import a PGN</a>.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="review-games">
          {games.map((g) => (
            <li key={g.id}>
              <a
                href={`#/review/${g.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 hover:outline-1 hover:outline-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{gameTitle(g)}</span>
                  <span className="block text-xs text-muted">
                    {describeEnd(g)} · {Math.ceil(g.moves.length / 2)} moves · {new Date(g.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{reviewFits(g, g.review) ? 'Reviewed' : 'Not reviewed'}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GameReviewView({ record, onSaved }: { record: GameRecord; onSaved: (r: GameRecord) => void }) {
  const setReview = useGameStore((s) => s.setReview);
  const setMaiaMatch = useGameStore((s) => s.setMaiaMatch);
  const review = reviewFits(record, record.review) ? record.review : null;
  const [depth, setDepth] = useState<number>(review ? nextDepth(review.depth, REVIEW.depth) : REVIEW.depth.normal);
  const [rerunOpen, setRerunOpen] = useState(false);
  const run = useReviewRun(record, (r) => {
    const saved = setReview(record.id, r);
    if (saved) onSaved(saved);
    if (saved) recordTrainedDay();
    setRerunOpen(false);
  });

  const title = (
    <div className="min-w-0">
      <h1 className="truncate text-xl font-bold">{gameTitle(record)}</h1>
      <p className="text-sm text-muted">{describeEnd(record)}</p>
    </div>
  );

  if (!review) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          {title}
          <a className="shrink-0 text-sm text-muted hover:text-ink" href="#/review/games">Other games</a>
        </div>
        <p className="text-sm text-muted">
          Stockfish analyses every position at full strength and labels each move. Deeper takes longer.
        </p>
        <ReviewRunPanel run={run} depth={depth} onDepth={setDepth} />
      </div>
    );
  }

  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        {title}
        <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
          <a className="text-muted hover:text-ink" href="#/review/games">Other games</a>
          {!rerunOpen && run.status === 'idle' && (
            <button className="text-muted hover:text-ink" onClick={() => setRerunOpen(true)}>
              Re-run (depth {review.depth})
            </button>
          )}
        </div>
      </div>
      {(rerunOpen || run.status !== 'idle') && (
        <ReviewRunPanel
          run={run}
          depth={depth}
          onDepth={setDepth}
          startLabel="Re-run review"
          onClose={() => setRerunOpen(false)}
        />
      )}
    </div>
  );

  // Keyed by the review so a re-run starts the screen fresh on the new labels.
  return (
    <ReviewScreen
      key={review.createdAt}
      record={record}
      review={review}
      header={header}
      onMaiaMatch={(m) => {
        const saved = setMaiaMatch(record.id, m);
        if (saved) onSaved(saved);
      }}
      onReviewChange={(r) => {
        const saved = setReview(record.id, r);
        if (saved) onSaved(saved);
      }}
    />
  );
}

/**
 * `#/review` shows the current game when it is finished, otherwise a list of finished games;
 * `#/review/<id>` reviews that game (the current one or a saved one); `#/review/games` is the list.
 */
export function ReviewPage({ gameId }: { gameId?: string }) {
  const current = useGameStore((s) => s.record);
  // A saved (not current) game is read once from storage, then kept here as reviews are added.
  const [saved, setSaved] = useState<GameRecord | null>(() =>
    gameId && gameId !== 'games' && gameId !== current.id ? findArchivedGame(gameId) : null,
  );

  const authStatus = useAuthStore((s) => s.status);
  const wantsServer = !!gameId && gameId !== 'games' && gameId !== current.id && !saved;
  // Not on this device: a signed-in player's game is fetched from the server and saved locally,
  // so the review flow below (which reads and writes local storage) works unchanged.
  const [remote, setRemote] = useState<'idle' | 'loading' | 'missing' | 'failed'>('idle');
  const [remoteError, setRemoteError] = useState('');
  useEffect(() => {
    if (!wantsServer || authStatus !== 'signed-in' || !gameId) return;
    let live = true;
    setRemote('loading');
    api
      .getGame(gameId)
      .then(({ record }) => {
        if (!live) return;
        updateArchivedGame(record);
        setSaved(record);
        setRemote('idle');
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) setRemote('missing');
        else {
          setRemoteError(e instanceof Error ? e.message : String(e));
          setRemote('failed');
        }
      });
    return () => {
      live = false;
    };
  }, [wantsServer, authStatus, gameId]);

  if (gameId === 'games') return <GamePicker intro="Pick a finished game to review." />;

  if (wantsServer && (authStatus === 'unknown' || (authStatus === 'signed-in' && remote === 'idle') || remote === 'loading')) {
    return <p className="p-6 text-center text-sm text-muted">Loading game…</p>;
  }
  if (wantsServer && remote === 'failed') {
    return <GamePicker intro={`Couldn't load that game from the server: ${remoteError} Pick a game saved on this device.`} />;
  }

  const record = !gameId || gameId === current.id ? current : saved;
  if (!gameId && current.result === '*') {
    return <GamePicker intro="The current game isn't finished yet. Pick a finished game to review." />;
  }
  if (!record || record.result === '*') {
    return <GamePicker intro="That game isn't available for review. Pick a finished game." />;
  }
  return <GameReviewView key={record.id} record={record} onSaved={setSaved} />;
}
