// One drilled line (pure): the moves of a repertoire path, which ones the user answers, and checking an answer.
// The timing (opponent moves, feedback) lives in ./drillStore.
import type { Color } from '../game/types';
import type { VariationTree } from '../game/variationTree';
import { splitComment } from '../game/variationTree';
import { toEpd } from './openings';

export type DrillStep = {
  /** The node this move leads to. */
  nodeId: string;
  /** Position before the move. */
  fenBefore: string;
  fenAfter: string;
  uci: string;
  san: string;
  /** The user plays this move (else the board plays it). */
  user: boolean;
  /** The card (EPD of `fenBefore`) for a user move. */
  key: string;
  /** Plain text of the move's PGN comment (its plan), without [%...] commands; '' when none. */
  plan: string;
};

export function drillSteps(tree: VariationTree, color: Color, path: string[]): DrillStep[] {
  const steps: DrillStep[] = [];
  for (let i = 1; i < path.length; i++) {
    const before = tree.nodes[path[i - 1]];
    const n = tree.nodes[path[i]];
    steps.push({
      nodeId: n.id,
      fenBefore: before.fen,
      fenAfter: n.fen,
      uci: n.uci!,
      san: n.san!,
      user: before.fen.split(' ')[1] === color,
      key: toEpd(before.fen),
      plan: splitComment(n.comment).text,
    });
  }
  return steps;
}

export type Verdict =
  /** The line's move. */
  | 'correct'
  /** Another move the repertoire has from this position (a different line): not a mistake, but not this line. */
  | 'other-line'
  | 'wrong';

/** Judges the user's move `uci` (chess.js LAN) at `step` (the parent node's other children count as 'other-line'). */
export function judgeMove(tree: VariationTree, step: DrillStep, uci: string): Verdict {
  if (sameMove(uci, step.uci)) return 'correct';
  const parentId = tree.nodes[step.nodeId].parentId;
  const siblings = parentId ? tree.nodes[parentId].children : [];
  return siblings.some((id) => sameMove(tree.nodes[id].uci ?? '', uci)) ? 'other-line' : 'wrong';
}

/** UCI equality (both are chess.js LAN, so a promotion always names its piece). */
function sameMove(a: string, b: string): boolean {
  return a === b;
}
