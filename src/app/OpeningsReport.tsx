import { useEffect, useMemo, useState } from 'react';
import { openingsReport, type OpeningRow } from '../account/openingsReport';
import { loadHistory } from '../game/storage';
import type { Color, GameRecord } from '../game/types';
import { lookupBook } from '../openings/openings';
import { reviewFits } from '../review/reviewView';
import { useBatchReview } from './batchReview';

export type OpeningPick = { name: string; color: Color; ids: string[] };

/** Opening name per game: the review's when there is one, else from the openings dataset. */
async function openingNames(records: GameRecord[]): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  await Promise.all(
    records.map(async (r) => {
      const fromReview = reviewFits(r, r.review) ? r.review.opening?.name : undefined;
      if (fromReview) return void names.set(r.id, fromReview);
      const book = await lookupBook(r.startFen, r.moves);
      names.set(r.id, book.name ?? null);
    }),
  );
  return names;
}

function Row({ row, onPick }: { row: OpeningRow; onPick: (p: OpeningPick) => void }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-surface p-2.5" data-testid="opening-row">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-semibold">{row.name}</span>
        <span className="shrink-0 font-mono text-sm" title="Score: wins plus half the draws">{row.score}%</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded bg-surface-2" aria-hidden>
        <div className="bg-accent" style={{ width: `${(row.won / row.games) * 100}%` }} />
        <div className="bg-muted opacity-50" style={{ width: `${(row.drawn / row.games) * 100}%` }} />
        <div className="bg-danger" style={{ width: `${(row.lost / row.games) * 100}%` }} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
        <span>
          {row.games} game{row.games === 1 ? '' : 's'} ·{' '}
          <span className="text-accent">{row.won}W</span> {row.drawn}D <span className="text-danger">{row.lost}L</span>
        </span>
        <button className="font-medium text-accent hover:underline" onClick={() => onPick({ name: row.name, color: row.color, ids: row.gameIds })}>
          Show games →
        </button>
      </div>
      {row.reviewed > 0 && (
        <p className="text-xs">
          {row.wrongAround !== null ? (
            <>
              Usually goes wrong around <span className="font-semibold">move {row.wrongAround}</span>
              <span className="text-muted"> ({row.wrongGames} of {row.reviewed} reviewed)</span>
            </>
          ) : (
            <span className="text-muted">No inaccuracies in {row.reviewed} reviewed game{row.reviewed === 1 ? '' : 's'}</span>
          )}
        </p>
      )}
    </li>
  );
}

/**
 * Results per opening and colour, from the finished games saved on this device (games played or imported
 * here, and account games opened here). The server's game list has no moves, so it can't add to it.
 */
export function OpeningsReport({ signedIn, onPick }: { signedIn: boolean; onPick: (p: OpeningPick) => void }) {
  // A background "Review all" run adds reviews while this is open: re-read after each one.
  const reviewedInBatch = useBatchReview((s) => s.reviewed);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read storage after each review
  const records = useMemo(() => loadHistory().filter((g) => g.result !== '*'), [reviewedInBatch]);
  const [names, setNames] = useState<Map<string, string | null> | null>(null);
  const [failed, setFailed] = useState(false);
  const [variations, setVariations] = useState(false);

  useEffect(() => {
    let live = true;
    openingNames(records)
      .then((n) => live && setNames(n))
      .catch(() => {
        if (!live) return;
        // Offline or a failed chunk: still show results, with every game under "Unknown opening".
        setFailed(true);
        setNames(new Map());
      });
    return () => {
      live = false;
    };
  }, [records]);

  const rows = useMemo(
    () => (names ? openingsReport(records.map((record) => ({ record, opening: names.get(record.id) })), variations ? 'variation' : 'family') : []),
    [names, records, variations],
  );

  if (!names) return <p className="text-sm text-muted">Finding openings…</p>;
  const counted = rows.reduce((n, r) => n + r.games, 0);
  const sections: { color: Color; title: string }[] = [
    { color: 'w', title: 'As White' },
    { color: 'b', title: 'As Black' },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="openings-report">
      <p className="text-xs text-muted">
        From the {counted} finished game{counted === 1 ? '' : 's'} saved on this device where your side is known
        {records.length > counted && ` (${records.length - counted} between two people at one screen, or with neither name matched, are left out)`}.
        {signedIn && ' Account games you never opened on this device are not included.'} Review games to see where you usually go wrong.
      </p>
      {failed && <p role="alert" className="text-sm text-danger">Couldn't load opening names, so games are listed as unknown.</p>}
      <label className="flex items-center gap-2 self-start text-sm">
        <input type="checkbox" checked={variations} onChange={(e) => setVariations(e.target.checked)} />
        Split by variation
      </label>
      {counted === 0 ? (
        <p className="rounded-lg bg-surface p-3 text-sm">
          No games to report on yet. <a className="text-accent underline" href="#/play">Play</a> or{' '}
          <a className="text-accent underline" href="#/import">import</a> some.
        </p>
      ) : (
        sections.map(({ color, title }) => {
          const mine = rows.filter((r) => r.color === color);
          if (mine.length === 0) return null;
          return (
            <section key={color} aria-label={title}>
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
              <ul className="flex flex-col gap-2">
                {mine.map((r) => (
                  <Row key={r.name} row={r} onPick={onPick} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
