import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GraphPoint } from '../review/reviewView';
import { LABEL_STYLE } from './labelStyle';
import { tierOf, TIER_STYLE } from '../review/reviewStyle';

// Drawn like the eval bar: White's share is the light area rising from the dark floor, in both themes.
const FLOOR = '#262421';
const WHITE_AREA = '#ecebe8';
const LINE = '#bdbab3';
const MARK = '#8a8780';

type DotProps = { cx?: number; cy?: number; payload?: GraphPoint };

function moveName(ply: number, san?: string): string {
  if (!san) return 'Start';
  const no = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${no}. ${san}` : `${no}... ${san}`;
}

function GraphTooltip({ active, payload }: { active?: boolean; payload?: { payload: GraphPoint }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded bg-surface px-2 py-1 text-xs text-ink shadow">
      <div className="font-mono">{moveName(p.ply, p.san)}</div>
      <div className="text-muted">
        White {Math.round(p.win)}%{p.marked ? ` · ${p.marked}` : ''}
      </div>
    </div>
  );
}

/**
 * White's win chance over the game. Brilliant, Great, Miss, Mistake and Blunder moves get a dot in their
 * label colour; clicking anywhere on the graph (or a dot) jumps to that ply.
 */
export function EvalGraph({
  data,
  ply,
  onSelect,
  learner = false,
}: {
  data: GraphPoint[];
  ply: number;
  onSelect: (ply: number) => void;
  /** Learner style: dots in the three tier colours. */
  learner?: boolean;
}) {
  function renderDot({ cx, cy, payload }: DotProps) {
    if (!payload?.marked || cx === undefined || cy === undefined) return <g key={`d${payload?.ply}`} />;
    return (
      <circle
        key={`d${payload.ply}`}
        data-testid={`graph-dot-${payload.ply}`}
        aria-label={`${payload.marked} at ${moveName(payload.ply, payload.san)}`}
        role="button"
        cx={cx}
        cy={cy}
        r={5}
        fill={learner ? TIER_STYLE[tierOf(payload.marked)].color : LABEL_STYLE[payload.marked].color}
        data-tier={learner ? tierOf(payload.marked) : undefined}
        stroke={FLOOR}
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(payload.ply);
        }}
      />
    );
  }

  return (
    <div
      // Clicking a dot focuses its SVG group, and Chrome rings the whole group; keyboard focus keeps a ring.
      className="h-32 w-full overflow-hidden rounded-lg sm:h-36 [&_svg_*]:outline-none [&_svg:focus-visible]:outline-2 [&_svg:focus-visible]:outline-accent"
      style={{ backgroundColor: FLOOR }}
      data-testid="eval-graph"
      role="group"
      aria-label="Evaluation graph: White's win chance by move"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 6, right: 6, bottom: 6, left: 6 }}
          onClick={(e) => {
            const i = Number(e?.activeTooltipIndex);
            if (Number.isInteger(i) && data[i]) onSelect(data[i].ply);
          }}
          style={{ cursor: 'pointer' }}
        >
          <XAxis dataKey="ply" type="number" domain={[0, Math.max(1, data.length - 1)]} hide />
          <YAxis domain={[0, 100]} hide />
          <Area
            type="monotone"
            dataKey="win"
            baseValue={0}
            stroke={LINE}
            strokeWidth={2}
            fill={WHITE_AREA}
            fillOpacity={1}
            isAnimationActive={false}
            dot={renderDot}
            activeDot={{ r: 4, fill: WHITE_AREA, stroke: FLOOR, strokeWidth: 2 }}
          />
          <ReferenceLine y={50} stroke={MARK} strokeDasharray="3 3" />
          <ReferenceLine x={ply} stroke="var(--accent)" strokeWidth={2} />
          <Tooltip content={<GraphTooltip />} cursor={{ stroke: MARK, strokeWidth: 1 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
