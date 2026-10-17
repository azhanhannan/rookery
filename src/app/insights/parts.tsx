// Insights page pieces: bucket cards, evidence lists, tags, and the Analyst tables. Every number carries its n
// and its 90% interval or an "early read" tag.
import type { ReactNode } from 'react';
import type {
  AfterLossLine,
  ClockCard,
  EpisodeCard,
  EpisodeStat,
  EvidenceRef,
  GameFacts,
  Ledger,
  LedgerBucket,
  OpeningRow,
  PhaseRate,
  TrainTarget,
  Trend,
} from '../../insights/types';
import { reviewHref, trainHref } from '../deepLinks';
import { bucketName, PHASE_NAME, pct, plural, pts, rate1, trainLabel, withInterval } from './wording';

export const panel = 'flex flex-col gap-2 rounded-lg bg-surface p-3';
export const btn = 'rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-medium hover:outline-1 hover:outline-accent disabled:opacity-40';
export const primary = 'rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-40';

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'danger' }) {
  const color = tone === 'accent' ? 'bg-accent text-accent-ink' : tone === 'danger' ? 'bg-danger text-white' : 'bg-surface-2 text-muted';
  return <span className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}>{children}</span>;
}

export const EarlyRead = ({ on }: { on: boolean }) => (on ? <Tag>early read</Tag> : null);

export function TrainLink({ target, testId = 'train-this' }: { target: TrainTarget; testId?: string }) {
  return (
    <a className={primary} href={trainHref(target)} data-testid={testId}>
      Train this: {trainLabel(target)}
    </a>
  );
}

/** "Game vs Maia 1100, move 12" per evidence position, opening the review at that ply. */
export function EvidenceList({
  evidence,
  facts,
  limit = 5,
  plain = false,
}: {
  evidence: EvidenceRef[];
  facts: Map<string, GameFacts>;
  limit?: number;
  plain?: boolean;
}) {
  if (evidence.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted">{plain ? 'See it in your games' : `Deciding moves (${evidence.length > limit ? `${limit} of ${evidence.length}` : evidence.length})`}</p>
      <ul className="flex flex-col gap-0.5 text-sm" data-testid="evidence">
        {evidence.slice(0, limit).map((e) => {
          const g = facts.get(e.gameId);
          const no = Math.ceil(e.ply / 2);
          return (
            <li key={`${e.gameId}:${e.ply}`}>
              <a className="text-accent hover:underline" href={reviewHref(e.gameId, e.ply)} data-testid="evidence-link">
                {g ? `vs ${g.opponentName}` : 'A game'}, move {no}
                {g && <span className="text-muted"> · {new Date(g.playedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
              </a>
              {!plain && <span className="text-xs text-muted"> · gave away {Math.round(e.loss)}% win chance</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The bucket's numbers: n, rate per 100 moves and points per game, each with its interval. */
export function BucketNumbers({ b }: { b: LedgerBucket }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm" data-testid="bucket-numbers">
      <p>
        <span className="font-semibold tabular-nums">{plural(b.events, 'time')}</span> in {plural(b.moves, 'move')} over {plural(b.games, 'game')}{' '}
        <EarlyRead on={b.earlyRead} />
      </p>
      <p className="text-xs text-muted tabular-nums">
        {withInterval(b.rate, rate1)} per 100 moves · {withInterval(b.pointsPerGame, pts)} points of win chance lost per game (90% intervals)
      </p>
    </div>
  );
}

export function TrendLine({ trend }: { trend: Trend }) {
  const word = trend.direction === 'improving' ? 'getting better' : trend.direction === 'worsening' ? 'getting worse' : 'no clear change';
  return (
    <p className="text-xs text-muted" data-testid="trend">
      Long-term trend over {plural(trend.games, 'game')}: <span className="font-semibold text-ink">{word}</span> (slope{' '}
      {withInterval(trend.slope, (x) => x.toFixed(3))} points per game)
    </p>
  );
}

/** A Watch card (Club) or one of the top cards (Analyst). */
export function BucketCard({
  bucket,
  role,
  facts,
  trend,
}: {
  bucket: LedgerBucket;
  role: 'watch' | 'card';
  facts: Map<string, GameFacts>;
  trend?: Trend;
}) {
  return (
    <section className={panel} data-testid={role === 'watch' ? 'watch-card' : 'insight-card'}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{bucketName(bucket.id)}</h3>
        <Tag>{role === 'watch' ? 'Watch' : 'Card'}</Tag>
      </div>
      <BucketNumbers b={bucket} />
      {trend && <TrendLine trend={trend} />}
      <EvidenceList evidence={bucket.evidence} facts={facts} limit={role === 'watch' ? 3 : 5} />
      {bucket.train && <TrainLink target={bucket.train} testId="card-train" />}
    </section>
  );
}

/** Analyst: every ledger bucket with data, best-ranked first. */
export function LedgerTable({ ledger }: { ledger: Ledger }) {
  const rows = [...ledger.cells, ...ledger.overlays].filter((b) => b.events > 0);
  return (
    <section className={panel} data-testid="ledger">
      <h2 className="font-semibold">Points-lost ledger</h2>
      <p className="text-xs text-muted">
        Win chance given away per game, by phase and what caused it, over {plural(ledger.games, 'game')}: {pts(ledger.pointsPerGame)} points per
        game in all. No rule explains {pct(ledger.otherShare)} of it. Ranked by the low end of each 90% interval, after shrinking small
        buckets toward the average.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing lost yet in the games counted.</p>
      ) : (
        <div className="-mx-3 overflow-x-auto px-3">
          <table className="w-full min-w-[34rem] text-left text-xs tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Bucket</th>
                <th className="py-1 pr-2 font-medium">Games</th>
                <th className="py-1 pr-2 font-medium">Events / moves</th>
                <th className="py-1 pr-2 font-medium">Per 100 moves</th>
                <th className="py-1 pr-2 font-medium">Points / game</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t border-surface-2" data-testid="ledger-row">
                  <td className="py-1 pr-2">{bucketName(b.id)}</td>
                  <td className="py-1 pr-2">{b.games}</td>
                  <td className="py-1 pr-2">
                    {b.events} / {b.moves}
                  </td>
                  <td className="py-1 pr-2">{withInterval(b.rate, rate1)}</td>
                  <td className="py-1 pr-2">{withInterval(b.pointsPerGame, pts)}</td>
                  <td className="py-1">
                    {b.eligible ? <Tag tone="accent">can be Focus</Tag> : !b.shown ? <Tag>too few</Tag> : <EarlyRead on={b.earlyRead} />}
                    {b.overlay && <span className="ml-1 text-muted">(overlaps)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PhaseRates({ rates }: { rates: PhaseRate[] }) {
  return (
    <section className={panel} data-testid="phase-rates">
      <h2 className="font-semibold">Errors by phase</h2>
      <p className="text-xs text-muted">Mistakes or worse per 100 moves (positions already lost left out), 90% intervals.</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {rates.map((r) => (
          <li key={r.phase} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold">
              {PHASE_NAME[r.phase]} {r.weakest && <Tag tone="danger">weakest</Tag>} <EarlyRead on={r.shown && r.earlyRead} />
            </span>
            <span className="text-xs text-muted tabular-nums">
              {r.shown ? (
                <>
                  {withInterval(r.rate, rate1)} errors · {withInterval(r.slipRate, rate1)} slips per 100 · {plural(r.moves, 'move')}
                </>
              ) : (
                <>Too few moves yet ({r.moves})</>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClockView({ clock }: { clock: ClockCard | null }) {
  if (!clock) return null;
  return (
    <section className={panel} data-testid="clock-card">
      <h2 className="font-semibold">The clock</h2>
      {clock.shown ? (
        <p className="text-sm">
          In time trouble: {clock.troubleErrors} errors in {plural(clock.troubleMoves, 'move')}; otherwise {clock.normalErrors} in{' '}
          {plural(clock.normalMoves, 'move')}.{' '}
          {clock.differs ? (
            <>
              Errors are {withInterval(clock.ratio, (x) => `${x.toFixed(1)}×`)} as frequent in time trouble.
            </>
          ) : (
            <span className="text-muted">No clear difference (ratio {withInterval(clock.ratio, (x) => `${x.toFixed(1)}×`)}).</span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted">
          Not enough moves in time trouble yet ({clock.troubleMoves} over {plural(clock.games, 'timed game')}).
        </p>
      )}
      {clock.lostOnTimeWhileBetter.length > 0 && (
        <p className="text-sm">Lost on time while better: {plural(clock.lostOnTimeWhileBetter.length, 'game')}.</p>
      )}
    </section>
  );
}

function EpisodeLine({ name, s }: { name: string; s: EpisodeStat }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span>
        {name} <EarlyRead on={s.shown && s.earlyRead} />
      </span>
      <span className="text-xs text-muted tabular-nums">
        {s.shown ? (
          <>
            {s.won}W {s.drawn}D {s.lost}L of {s.episodes} · score {withInterval(s.score, pct)}
          </>
        ) : (
          <>{s.episodes} so far, too few to read</>
        )}
      </span>
    </li>
  );
}

export function EpisodesView({ conversion, saves }: { conversion: EpisodeCard; saves: EpisodeCard }) {
  return (
    <section className={panel} data-testid="episodes">
      <h2 className="font-semibold">Converting and saving</h2>
      <p className="text-xs text-muted">Games where you were clearly winning (or clearly losing) for two moves in a row, and how they ended.</p>
      <ul className="flex flex-col gap-1 text-sm">
        <EpisodeLine name="Winning positions, all" s={conversion.all} />
        <EpisodeLine name="… against people" s={conversion.human} />
        <EpisodeLine name="… against bots" s={conversion.bot} />
        <EpisodeLine name="Losing positions saved, all" s={saves.all} />
      </ul>
      <a className="text-sm text-accent hover:underline" href={trainHref(conversion.train)}>
        {trainLabel(conversion.train)} →
      </a>
    </section>
  );
}

export function OpeningsView({ rows }: { rows: OpeningRow[] }) {
  const shown = rows.filter((r) => r.shown);
  const hidden = rows.length - shown.length;
  return (
    <section className={panel} data-testid="opening-rows">
      <h2 className="font-semibold">Openings</h2>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">No opening has 10 reviewed games yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {shown.map((r) => (
            <li key={`${r.color}|${r.name}`} className="flex flex-col">
              <span className="font-semibold">
                {r.name} <span className="font-normal text-muted">as {r.color === 'w' ? 'White' : 'Black'}</span> <EarlyRead on={r.earlyRead} />
              </span>
              <span className="text-xs text-muted tabular-nums">
                {r.won}W {r.drawn}D {r.lost}L of {r.games} · score {withInterval(r.score, pct)}
                {r.performance !== null && ` · performance ${r.performance}`} · {pts(r.openingLoss)} points lost in the opening per game
                {r.firstSlipMove !== null && ` · first slip around move ${r.firstSlipMove}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && <p className="text-xs text-muted">{plural(hidden, 'opening')} with fewer than 10 games not shown.</p>}
    </section>
  );
}

export function AfterLossView({ line }: { line: AfterLossLine | null }) {
  return (
    <p className="rounded-lg bg-surface-2 p-2 text-sm" data-testid="after-loss">
      {line ? (
        <>
          {line.text} <span className="text-xs text-muted">Difference {withInterval(line.difference, pts)} (90%).</span>
        </>
      ) : (
        <span className="text-muted">Nothing to say: it needs 15 reviewed games right after a loss and a clear difference.</span>
      )}
    </p>
  );
}
