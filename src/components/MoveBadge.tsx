import type { MoveLabel } from '../review/types';
import { LABEL_STYLE } from './labelStyle';

export function MoveBadge({ label, size = 'sm' }: { label: MoveLabel; size?: 'sm' | 'md' }) {
  const { color, glyph } = LABEL_STYLE[label];
  const dim = size === 'md' ? 'h-6 w-6 text-[11px]' : 'h-4 w-4 text-[9px]';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-label={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white ${dim}`}
      style={{ backgroundColor: color }}
    >
      {glyph}
    </span>
  );
}
