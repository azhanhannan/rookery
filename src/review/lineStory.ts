// Line story: play the stored engine line out and say what provably happens. Contract in ./why.ts.
import type { ReviewStyle } from './reviewStyle';
import type { LineStory, LineStoryInput } from './why';

export function lineStory(input: LineStoryInput, style: ReviewStyle): LineStory {
  void input;
  void style;
  return { played: [], better: [] };
}
