import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RatingCategory, RatingPoint } from '../api/types';
import { CATEGORY_NAMES, CATEGORY_ORDER } from './ratingCategory';

// Mid-tone line colours that read on both the light and the dark surface; blitz (the commonest) takes the accent.
const LINE_COLOR: Record<RatingCategory, string> = {
  bullet: '#d0892b',
  blitz: 'var(--accent)',
  rapid: '#5b80c8',
  classical: '#a45fa0',
};

/** One row per rated game (oldest first); only the game's own category has a value. */
type Row = { n: number; at: string; category: RatingCategory } & Partial<Record<RatingCategory, number>>;

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded bg-surface px-2 py-1 text-xs text-ink shadow">
      <div className="font-semibold">
        {CATEGORY_NAMES[row.category]} {row[row.category]}
      </div>
      <div className="text-muted">
        Game {row.n} · {new Date(row.at).toLocaleDateString()}
      </div>
    </div>
  );
}

/** Rating after each rated game, one line per category, x = rated game number. */
export function RatingHistoryChart({ history }: { history: RatingPoint[] }) {
  const present = CATEGORY_ORDER.filter((c) => history.some((p) => p.category === c));
  const [hidden, setHidden] = useState<Set<RatingCategory>>(() => new Set());
  const shown = present.filter((c) => !hidden.has(c));

  const rows: Row[] = history.map((p, i) => ({ n: i + 1, at: p.at, category: p.category, [p.category]: p.rating }));
  // The y range follows the shown lines only, so hiding a far-off category rescales the rest.
  const values = history.filter((p) => !hidden.has(p.category)).map((p) => p.rating);
  const lo = values.length ? Math.floor((Math.min(...values) - 25) / 50) * 50 : 1400;
  const top = values.length ? Math.max(...values) + 25 : 1600;
  // Round steps (50, 100, 150...) with at most five gaps.
  const step = Math.max(50, Math.ceil((top - lo) / 5 / 50) * 50);
  const hi = lo + Math.ceil((top - lo) / step) * step;
  const ticks = Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step);

  function toggle(c: RatingCategory) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {present.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categories on the graph">
          {present.map((c) => (
            <button
              key={c}
              aria-pressed={!hidden.has(c)}
              onClick={() => toggle(c)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${hidden.has(c) ? 'bg-surface-2 text-muted' : 'bg-surface-2 text-ink outline-1 outline-accent'}`}
            >
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: LINE_COLOR[c], opacity: hidden.has(c) ? 0.35 : 1 }} />
              {CATEGORY_NAMES[c]}
            </button>
          ))}
        </div>
      )}
      <div
        className="h-56 w-full rounded-lg bg-surface p-2 sm:h-64 [&_svg_*]:outline-none"
        data-testid="rating-graph"
        role="img"
        aria-label={`Rating history: ${present.map((c) => `${CATEGORY_NAMES[c]} ${[...history].reverse().find((p) => p.category === c)?.rating}`).join(', ')}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--surface-2)" vertical={false} />
            <XAxis
              dataKey="n"
              type="number"
              domain={[1, Math.max(2, rows.length)]}
              allowDecimals={false}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              stroke="var(--surface-2)"
            />
            <YAxis
              domain={[lo, hi]}
              ticks={ticks}
              allowDecimals={false}
              width={40}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              stroke="var(--surface-2)"
            />
            {shown.map((c) => (
              <Line
                key={c}
                type="linear"
                dataKey={c}
                name={CATEGORY_NAMES[c]}
                stroke={LINE_COLOR[c]}
                strokeWidth={2}
                connectNulls
                dot={rows.length <= 40 ? { r: 2.5, fill: LINE_COLOR[c], strokeWidth: 0 } : false}
                activeDot={{ r: 4, fill: LINE_COLOR[c], stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
