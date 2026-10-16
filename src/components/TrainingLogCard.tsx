import { useMemo } from 'react';
import { todayKey } from '../puzzles/days';
import {
  countDatedEntries,
  isoWeek,
  loadTrainingLog,
  readDrillStore,
  weekTotals,
  type Tally,
  type TrainingKind,
} from '../training/trainingLog';

const ROWS: { kind: TrainingKind; name: string; always?: boolean }[] = [
  { kind: 'game', name: 'Games played', always: true },
  { kind: 'puzzle', name: 'Puzzles solved', always: true },
  { kind: 'review', name: 'Games reviewed', always: true },
  { kind: 'squares', name: 'Square drills' },
  { kind: 'endgame', name: 'Endgame drills' },
  { kind: 'opening', name: 'Opening drills' },
];

const STORE_FOR: Partial<Record<TrainingKind, 'rookery.endgames' | 'rookery.repertoires'>> = {
  endgame: 'rookery.endgames',
  opening: 'rookery.repertoires',
};

function minutes(sec: number): string {
  if (sec <= 0) return '';
  const m = Math.round(sec / 60);
  return m < 1 ? '<1 min' : `${m} min`;
}

function Cell({ t }: { t: Tally }) {
  const min = minutes(t.sec);
  return (
    <td className="py-1 text-right tabular-nums">
      <span className="font-semibold">{t.n}</span>
      {min && <span className="ml-1 text-xs text-muted">· {min}</span>}
    </td>
  );
}

/** Profile (own only): this week's training against last week's, from this device's log. */
export function TrainingLogCard() {
  const today = todayKey();
  const rows = useMemo(() => {
    const { thisWeek, lastWeek } = weekTotals(loadTrainingLog(), today);
    return ROWS.flatMap((r) => {
      let now = thisWeek[r.kind];
      let before = lastWeek[r.kind];
      // Drill stores from other features: their dated entries count when the log has none of that kind.
      const key = STORE_FOR[r.kind];
      const raw = key ? readDrillStore(key) : null;
      if (raw !== null && now.n === 0 && before.n === 0) {
        const c = countDatedEntries(raw, today);
        now = { n: c.thisWeek, sec: 0 };
        before = { n: c.lastWeek, sec: 0 };
      }
      const shown = r.always || raw !== null || now.n > 0 || before.n > 0;
      return shown ? [{ ...r, now, before }] : [];
    });
  }, [today]);
  const totalNow = rows.reduce((s, r) => s + r.now.sec, 0);
  const totalBefore = rows.reduce((s, r) => s + r.before.sec, 0);

  return (
    <section className="rounded-lg bg-surface p-3" data-testid="training-log" aria-labelledby="training-log-heading">
      <h2 id="training-log-heading" className="text-sm font-semibold">
        Training this week <span className="font-normal text-muted">(week {isoWeek(today)})</span>
      </h2>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="py-1 text-left font-normal">
              <span className="sr-only">Activity</span>
            </th>
            <th className="py-1 text-right font-normal">This week</th>
            <th className="py-1 text-right font-normal">Last week</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.kind} data-testid={`training-log-${r.kind}`} className="border-t border-surface-2">
              <td className="py-1">{r.name}</td>
              <Cell t={r.now} />
              <Cell t={r.before} />
            </tr>
          ))}
          <tr className="border-t border-surface-2 text-xs text-muted">
            <td className="py-1">Time, roughly</td>
            <td className="py-1 text-right tabular-nums">{minutes(totalNow) || '0 min'}</td>
            <td className="py-1 text-right tabular-nums">{minutes(totalBefore) || '0 min'}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted">Counted on this device, Monday to Sunday.</p>
    </section>
  );
}
