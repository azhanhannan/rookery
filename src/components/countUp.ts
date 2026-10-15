/** The count-up's value `elapsed` ms into a `duration` ms count to `target` (ease-out, whole numbers). */
export function countUpValue(target: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return target;
  const p = Math.max(0, elapsed) / duration;
  return Math.round(target * (1 - (1 - p) ** 3));
}

