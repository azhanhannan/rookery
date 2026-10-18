// "Train this": where each bucket sends the player. Only existing routes; null = nothing to train, so the
// bucket can never be the Focus.
import type { BucketId, Motif, Phase, TrainTarget } from './types';

const MOTIF_TARGET: Record<Motif, TrainTarget | null> = {
  hanging: { kind: 'mistakes', href: '#/puzzles', motif: 'hanging' },
  fork: { kind: 'lesson', href: '#/lessons', lessonId: 'forks' },
  'missed-free-piece': { kind: 'lesson', href: '#/lessons', lessonId: 'free-pieces' },
  'missed-mate': { kind: 'calculation', href: '#/puzzles' },
  'allowed-mate': { kind: 'mistakes', href: '#/puzzles', motif: 'allowed-mate' },
  'back-rank': { kind: 'lesson', href: '#/lessons', lessonId: 'back-rank' },
  'ignored-threat': { kind: 'mistakes', href: '#/puzzles', motif: 'ignored-threat' },
  stalemate: { kind: 'endgames', href: '#/endgames', drillId: 'kqk' },
  other: null,
};

const PHASE_TARGET: Record<Phase, TrainTarget> = {
  O: { kind: 'openings', href: '#/openings' },
  M: { kind: 'calculation', href: '#/puzzles' },
  E: { kind: 'endgames', href: '#/endgames' },
};

export function trainForMotif(motif: Motif): TrainTarget | null {
  return MOTIF_TARGET[motif];
}

export function trainForPhase(phase: Phase): TrainTarget {
  return PHASE_TARGET[phase];
}

/** Target for a ledger bucket; time trouble has none yet (no clock drill exists). */
export function trainForBucket(id: BucketId): TrainTarget | null {
  if (id === 'time-trouble') return null;
  if (id === 'conversion') return { kind: 'endgames', href: '#/endgames' };
  const motif = id.split(':')[1] as Motif;
  return trainForMotif(motif);
}

export const OPENINGS_TARGET: TrainTarget = { kind: 'openings', href: '#/openings' };
export const CONVERSION_TARGET: TrainTarget = { kind: 'endgames', href: '#/endgames' };
/** Rushed critical moves (profile Slice 2) and cost by type: calculation mode on Puzzles. */
export const CALCULATION_TARGET: TrainTarget = { kind: 'calculation', href: '#/puzzles' };
