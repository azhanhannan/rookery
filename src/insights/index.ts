// Insights: public API (pure, no React). Spec: docs/insights-2026-10/synthesis.md; numbers in INSIGHTS (tunables).
//
// Pipeline
//   1. buildAllFacts(records, userColor?) -> { facts, coverage }
//        One GameFacts per qualifying reviewed game (~1 KB, versioned by INSIGHTS.factsVersion), and what was
//        left out and why ("reviewed X of Y"). buildGameFacts(record) / exclusionReason(record) do one game.
//        Cache facts keyed `gameId|review signature|factsVersion`; rebuild on a version change, never migrate.
//   2. buildInsights(facts, { style, speed?, opponent?, now?, history?, coverage? }) -> InsightsModel
//        status ('locked' < 10 games, 'early' < 20), the points-lost ledger (cells phase × motif + overlays),
//        the Focus (top eligible bucket), cards by Review style, phase error rates, conversion and saves,
//        clock card, after-loss line (null unless it passes the strict rules), opening rows.
//        Pass `history: historyOf(records)` so "after a loss" also sees unreviewed games.
//   2b. buildProfile(model, { focusId? }) -> PlayerProfile   ("Your recent games": habit lines, profile.ts)
//   3. startFocus(facts, bucketId, now) -> Focus   (store it; synced key later)
//      focusStatus(focus, facts, now) -> FocusStatus   ('too-early' | 'on-track' | 'not-yet' | 'verdict')
//
// Every bucket/card carries n (games, moves, events), a 90% interval, `shown` (passes its gate), `earlyRead`,
// evidence refs { gameId, ply, loss, fenBefore? } and a `train` target (existing routes only).
// Nothing here reads storage, the engine or the network.

export { moveMotif } from './moveMotif';
export { buildAllFacts, buildGameFacts, exclusionReason, historyOf, phasesOf } from './facts';
export {
  afterLossLine,
  buildInsights,
  buildLedger,
  clockCard,
  filterFacts,
  openingRows,
  phaseRates,
  pickFocus,
  trendFor,
} from './aggregate';
export { bucketGames, CELL_IDS, OVERLAY_IDS, priorsOf, summariseBucket, type GameBucketStat, type Priors } from './buckets';
export { focusStatus, startFocus, type Focus, type FocusState, type FocusStatus, type FocusVerdict } from './focus';
export { allowedBackRankMate, gaveAwayStalemate, ignoredThreat, isBackRankMate, motifFor, newThreat, threatsAgainst } from './motifs';
export { trainForBucket, trainForMotif, trainForPhase } from './train';
export * from './stats';
export * from './types';
export {
  buildProfile,
  clubLines,
  CLOSING_LINE,
  focusLineId,
  learnerView,
  lockedText,
  noFocusText,
  PROFILE_BANNED,
  profileTexts,
  SECTION_TITLE,
  styleText,
  windowText,
  type LearnerView,
  type PlayerProfile,
  type ProfileLine,
  type ProfileOptions,
  type ProfileState,
  type ProfileTone,
} from './profile';
