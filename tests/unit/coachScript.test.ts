import { describe, expect, it } from 'vitest';
import { COACH_WALKTHROUGH } from '../../src/config/tunables';
import type { GameRecord } from '../../src/game/types';
import { coachScript, winBand } from '../../src/review/coachScript';
import type { GameReview } from '../../src/review/types';
import { SAMPLE_RECORD, SAMPLE_REVIEW } from '../fixtures/sample-review';

const NOTES = { w: 'About your level', b: null };
const script = (style: 'learner' | 'club' | 'analyst', record: GameRecord = SAMPLE_RECORD, review: GameReview = SAMPLE_REVIEW) =>
  coachScript({ record, review, style, accuracyNotes: style === 'analyst' ? undefined : NOTES });

describe('coach walkthrough script', () => {
  it('has an intro, one step per key moment (in game order, board before the move), and an outro', () => {
    const steps = script('club');
    expect(steps.map((s) => s.kind)).toEqual(['intro', 'moment', 'moment', 'moment', 'moment', 'outro']);
    // Key moments of the sample: 7. O-O, 7... Nf6, 9. h3, 10. Nxd4.
    const moments = steps.filter((s) => s.kind === 'moment');
    expect(moments.map((s) => s.movePly)).toEqual([13, 14, 17, 19]);
    expect(moments.map((s) => s.ply)).toEqual([12, 13, 16, 18]);
    expect(moments.map((s) => s.lineBase)).toEqual([12, 13, 16, 18]);
    expect(moments[0].title).toBe('Moment 1 of 4 · 7. O-O');
    expect(steps[0].ply).toBeUndefined();
  });

  it('intro: the result, the accuracy as the style shows it, and how many moments', () => {
    expect(script('club')[0].lines).toEqual([
      'You lost with White.',
      'Your accuracy was 69% (about your level).',
      "4 moments decided this game. Let's look at them one at a time.",
    ]);
    expect(script('learner')[0].lines[1]).toBe('Your accuracy: about your level.');
    expect(script('analyst')[0].lines[1]).toMatch(/^Accuracy: White \d+\.\d, Black \d+\.\d\.$/);
  });

  it('offers "Find the better move" only on your own retry moves, by retry index', () => {
    const moments = script('club').filter((s) => s.kind === 'moment');
    expect(moments.map((s) => s.retryIndex)).toEqual([0, undefined, 1, 2]);
  });

  it('uses the proven caption when there is one, else only what the engine numbers say', () => {
    const moments = script('club').filter((s) => s.kind === 'moment');
    expect(moments[3].lines).toContain('This allowed mate in 1 (Qh2#).');
    // No caption, a retry offered: the better move is not given away.
    expect(moments[0].lines[2]).toBe('This made the position harder. The engine found a better move here.');
    // No caption, the opponent's move: the engine's choice is named.
    expect(moments[1].lines[0]).toBe('Move 7: Black to play, and played Nf6.');
    expect(moments[1].lines[2]).toBe('This let the advantage slip: the engine preferred Ne5.');
  });

  it('stakes per style: Learner words only, Club words and %, Analyst numbers', () => {
    const at = (style: 'learner' | 'club' | 'analyst') => script(style).find((s) => s.movePly === 17)!.lines[1];
    expect(at('learner')).toBe('Before this move, you were about even. After it, you were worse.');
    expect(at('club')).toBe('Before this move, you were about even (44% win chance). After it, you were worse (20% win chance).');
    expect(at('analyst')).toMatch(/^Your win chance 44% → 20% \(eval −0\.\d\d → −3\.\d\d\)\.$/);
    // Learner never shows a number other than move numbers.
    for (const s of script('learner')) for (const l of s.lines) expect(l).not.toMatch(/%|eval|\d+\.\d/);
  });

  it('outro: the biggest mistake with its phase, and a Train this link', () => {
    const outro = script('club').at(-1)!;
    expect(outro.kind).toBe('outro');
    expect(outro.lines[0]).toMatch(/^Your biggest mistake was 9\. h3, in the (opening|middlegame|endgame)\. That's the one to remember\.$/);
    expect(outro.movePly).toBe(17);
    expect(outro.ply).toBe(16);
    expect(outro.train?.href).toMatch(/^#\//);
  });

  it('two people with no side known: side names, no "you"', () => {
    const record: GameRecord = { ...SAMPLE_RECORD, black: { name: 'Friend', isBot: false } };
    // As the summary cards say it for two people: "Typical for ~N", never "your level".
    const steps = coachScript({ record, review: SAMPLE_REVIEW, style: 'club', accuracyNotes: { w: 'Typical for ~800', b: null } });
    expect(steps[0].lines[0]).toBe('Black won.');
    expect(steps[0].lines[1]).toBe("White's accuracy was 69% (typical for ~800). Black's accuracy was 91%.");
    for (const s of steps) for (const l of s.lines.filter((x) => !x.includes('mate in'))) expect(l).not.toMatch(/\byou(r)?\b/i);
    // Both sides practise, so the opponent's Miss can be retried too.
    expect(steps.find((s) => s.movePly === 14)!.retryIndex).toBeDefined();
  });

  it('a clean game: no swings, no mistakes', () => {
    const review: GameReview = { ...SAMPLE_REVIEW, moves: SAMPLE_REVIEW.moves.map((m) => ({ ...m, loss: 0, label: 'Best' })) };
    const steps = script('learner', { ...SAMPLE_RECORD, result: '1-0' }, review);
    expect(steps.map((s) => s.kind)).toEqual(['intro', 'outro']);
    expect(steps[0].lines).toContain('There were no big swings in this game.');
    expect(steps[0].lines[0]).toBe('You won with White.');
    expect(steps[1].lines).toEqual(['The engine found no mistakes for you in this game. Well played.']);
    expect(steps[1].train).toBeUndefined();
  });

  it('win chance words follow the tunable bands', () => {
    const b = COACH_WALKTHROUGH.bands;
    expect(winBand(100)).toBe('winning');
    expect(winBand(b.winning)).toBe('winning');
    expect(winBand(b.winning - 1)).toBe('better');
    expect(winBand(b.better)).toBe('better');
    expect(winBand(50)).toBe('even');
    expect(winBand(b.worse)).toBe('worse');
    expect(winBand(b.losing)).toBe('losing');
    expect(winBand(0)).toBe('losing');
  });
});
