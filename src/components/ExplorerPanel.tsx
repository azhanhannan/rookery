import { useState, type ReactNode } from 'react';
import { formatGames, gameUrl, isRareMove, moveShare, RATING_GROUPS, SPEEDS, splitPercents, type ExplorerFilters, type ExplorerGame, type ExplorerResult, type ExplorerSource, type ExplorerSpeed } from '../explorer/explorer';
import { loadExplorerPrefs, saveExplorerPrefs, useExplorer, type ExplorerPrefs } from '../explorer/useExplorer';

const chip = (on: boolean) =>
  `rounded-md px-2 py-0.5 text-xs font-medium ${on ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:outline-1 hover:outline-accent'}`;

const SPEED_LABEL: Record<ExplorerSpeed, string> = {
  ultraBullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Corresp.',
};

/** White / draw / black share as one bar, Lichess style, with the percentages written in when there's room. */
export function ResultBar({ white, draws, black }: { white: number; draws: number; black: number }) {
  const p = splitPercents({ white, draws, black });
  const seg = (pct: number, cls: string, label: string) =>
    pct > 0 ? (
      <span className={`flex items-center justify-center overflow-hidden ${cls}`} style={{ width: `${pct}%` }} title={`${label} ${pct}%`}>
        {pct >= 12 ? `${pct}%` : ''}
      </span>
    ) : null;
  return (
    <span className="flex h-4 w-full overflow-hidden rounded-sm text-[10px] leading-none font-semibold" aria-label={`White ${p.white}%, draw ${p.draws}%, Black ${p.black}%`}>
      {seg(p.white, 'bg-[#f2f2f2] text-[#222]', 'White')}
      {seg(p.draws, 'bg-[#9a9a9a] text-[#111]', 'Draw')}
      {seg(p.black, 'bg-[#2b2b2b] text-[#eee]', 'Black')}
    </span>
  );
}

function gameResult(g: ExplorerGame): string {
  return g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½';
}

function playerText(p: ExplorerGame['white']): string {
  return p.rating ? `${p.name} (${p.rating})` : p.name;
}

/**
 * The opening explorer: Lichess masters or Lichess games for `fen`. Clicking a move plays it (with `onPlay`);
 * `highlightUci` marks a move (Review: the one played in the game). Collapsible; the choice is remembered.
 */
export function ExplorerPanel({
  fen,
  onPlay,
  highlightUci,
}: {
  fen: string;
  onPlay?: (uci: string) => void;
  highlightUci?: string | null;
}) {
  const [prefs, setPrefs] = useState<ExplorerPrefs>(loadExplorerPrefs);
  const update = (p: Partial<ExplorerPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    saveExplorerPrefs(next);
  };
  const look = useExplorer(fen, prefs.source, prefs.filters, prefs.open);

  // While the next position loads, keep the last answer on screen (dimmed) instead of flashing empty.
  const [last, setLast] = useState<ExplorerResult | null>(null);
  if (look.status === 'ok' && (look.result.fen !== last?.fen || look.result.source !== last.source)) setLast(look.result);
  const shown = look.status === 'ok' ? look.result : look.status === 'loading' && last?.source === prefs.source ? last : null;

  const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setFilters = (f: Partial<ExplorerFilters>) => update({ filters: { ...prefs.filters, ...f } });
  const source = (s: ExplorerSource) => update({ source: s });

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3" data-testid="explorer-panel">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="flex items-center gap-1 text-sm font-semibold"
          aria-expanded={prefs.open}
          onClick={() => update({ open: !prefs.open })}
        >
          <span className="w-3 text-xs text-muted">{prefs.open ? '▾' : '▸'}</span>
          Opening explorer
        </button>
        {prefs.open && (
          <div className="ml-auto flex gap-1" role="radiogroup" aria-label="Explorer database">
            <button role="radio" aria-checked={prefs.source === 'masters'} className={chip(prefs.source === 'masters')} onClick={() => source('masters')}>
              Masters
            </button>
            <button role="radio" aria-checked={prefs.source === 'lichess'} className={chip(prefs.source === 'lichess')} onClick={() => source('lichess')}>
              Lichess
            </button>
          </div>
        )}
      </div>

      {prefs.open && prefs.source === 'lichess' && (
        <div className="flex flex-col gap-1" data-testid="explorer-filters">
          <div className="flex flex-wrap gap-1" aria-label="Rating groups">
            {RATING_GROUPS.map((r) => (
              <button
                key={r}
                className={chip(prefs.filters.ratings.includes(r))}
                aria-pressed={prefs.filters.ratings.includes(r)}
                onClick={() => setFilters({ ratings: toggleIn(prefs.filters.ratings, r) })}
              >
                {r === 0 ? '<1000' : r === 2500 ? '2500+' : r}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" aria-label="Speeds">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={chip(prefs.filters.speeds.includes(s))}
                aria-pressed={prefs.filters.speeds.includes(s)}
                onClick={() => setFilters({ speeds: toggleIn(prefs.filters.speeds, s) })}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {prefs.open && <ExplorerStatus look={look} hasShown={shown !== null} />}

      {prefs.open && shown && (
        <div className={look.status === 'loading' ? 'opacity-60' : ''} data-testid="explorer-result">
          {shown.opening && (
            <p className="mb-1 text-xs text-muted" data-testid="explorer-opening">
              {shown.opening.eco && <span className="mr-1 font-mono">{shown.opening.eco}</span>}
              {shown.opening.name}
            </p>
          )}
          {shown.moves.length === 0 ? (
            <p className="text-sm text-muted">No games from this position in the {shown.source === 'masters' ? 'masters' : 'Lichess'} database.</p>
          ) : (
            <table className="w-full table-fixed text-sm" data-testid="explorer-moves">
              <thead>
                <tr className="text-left text-[10px] text-muted uppercase">
                  <th className="w-14 font-medium">Move</th>
                  <th className="w-16 text-right font-medium">Games</th>
                  <th className="px-2 font-medium">White / draw / Black</th>
                  <th className="w-10 text-right font-medium" title="Average rating">Avg</th>
                </tr>
              </thead>
              <tbody>
                {shown.moves.map((m) => {
                  const pct = shown.total > 0 ? Math.round((m.total / shown.total) * 100) : 0;
                  const mark = highlightUci === m.uci;
                  return (
                    <tr
                      key={m.uci}
                      className={`${onPlay ? 'cursor-pointer hover:bg-surface-2' : ''} ${mark ? 'bg-surface-2' : ''}`}
                      onClick={onPlay ? () => onPlay(m.uci) : undefined}
                      title={onPlay ? `Play ${m.san}` : undefined}
                      data-testid="explorer-move"
                    >
                      <td className="py-0.5 font-mono font-semibold">
                        {onPlay ? (
                          <button className="text-left" onClick={(e) => { e.stopPropagation(); onPlay(m.uci); }}>{m.san}</button>
                        ) : (
                          m.san
                        )}
                        {mark && <span className="ml-1 text-[10px] text-accent" title="Played in this game">●</span>}
                      </td>
                      <td className="py-0.5 text-right text-xs tabular-nums">
                        <span title={`${m.total.toLocaleString('en-US')} games`}>{formatGames(m.total)}</span>
                        <span className="ml-1 text-[10px] text-muted">{pct}%</span>
                      </td>
                      <td className="px-2 py-0.5"><ResultBar white={m.white} draws={m.draws} black={m.black} /></td>
                      <td className="py-0.5 text-right text-xs text-muted tabular-nums">{m.averageRating ?? ''}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-surface-2 text-xs text-muted">
                  <td className="pt-1">Σ</td>
                  <td className="pt-1 text-right tabular-nums">{formatGames(shown.total)}</td>
                  <td className="px-2 pt-1"><ResultBar white={shown.white} draws={shown.draws} black={shown.black} /></td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
          {shown.source === 'masters' && shown.topGames.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-medium text-muted uppercase">Top games</p>
              <ul className="flex flex-col gap-0.5 text-xs" data-testid="explorer-games">
                {shown.topGames.map((g) => (
                  <li key={g.id}>
                    <a
                      href={gameUrl(g.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex gap-2 rounded px-1 py-0.5 hover:bg-surface-2"
                      title="Open on lichess.org"
                    >
                      <span className="min-w-0 flex-1 truncate">{playerText(g.white)} – {playerText(g.black)}</span>
                      <span className="shrink-0 font-mono">{gameResult(g)}</span>
                      <span className="w-9 shrink-0 text-right text-muted">{g.year ?? ''}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-1 text-[10px] text-muted">Data: Lichess opening explorer</p>
        </div>
      )}
    </div>
  );
}

function ExplorerStatus({ look, hasShown }: { look: ReturnType<typeof useExplorer>; hasShown: boolean }) {
  const p = (text: ReactNode) => (
    <p className="text-sm text-muted" data-testid="explorer-status" role="status">{text}</p>
  );
  switch (look.status) {
    case 'loading':
      return hasShown ? null : p('Explorer: looking up…');
    case 'no-token':
      return p(
        <>
          The Lichess explorer now needs a Lichess token.{' '}
          <a href="#/account" className="text-accent hover:underline">Add a token in Settings</a> to use the explorer.
        </>,
      );
    case 'bad-token':
      return p(
        <>
          Lichess didn't accept the token.{' '}
          <a href="#/account" className="text-accent hover:underline">Check it in Settings</a>.
        </>,
      );
    case 'rate-limited':
      return p('Lichess is limiting requests; the explorer tries again in about a minute.');
    case 'offline':
      return p('Explorer unavailable offline.');
    case 'error':
      return p('Explorer unavailable right now.');
    default:
      return null;
  }
}

const NO_FILTERS: ExplorerFilters = { ratings: [], speeds: [] };

/**
 * Opening trainer: "Rare in master play" under a repertoire move played in under EXPLORER.rareShare of master
 * games from `fenBefore`. Shows nothing without a token, offline, or when the move is common.
 */
export function RareInMasters({ fenBefore, uci, san }: { fenBefore: string; uci: string; san: string }) {
  const look = useExplorer(fenBefore, 'masters', NO_FILTERS);
  if (look.status !== 'ok' || !isRareMove(look.result, uci)) return null;
  const share = moveShare(look.result, uci) ?? 0;
  const total = look.result.moves.reduce((n, m) => n + m.total, 0);
  return (
    <p className="rounded-lg bg-surface p-2 text-xs" data-testid="rare-in-masters">
      <span className="font-semibold">Rare in master play:</span> {san} was played in{' '}
      {share === 0 ? 'none' : `${(share * 100).toFixed(share < 0.01 ? 1 : 0)}%`} of {formatGames(total)} master games here.
    </p>
  );
}
