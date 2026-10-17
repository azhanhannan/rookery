# Insights — round 1, System Analyst

18 Oct 2026. Scope: what data Insights can be built from, the derived model, where it lives, and
what is statistically honest to show. Read against the code on `main`, not the docs.

## 1. Data inventory

| Fact | Status | Where / gap |
| --- | --- | --- |
| Moves (SAN, UCI, FEN after) | **Stored** | `MoveRecord`, `src/game/types.ts` |
| Clock left per move | **Stored when timed**: `clockMs` set in `src/game/rules.ts:116`; imports parse `[%clk]` (`src/game/pgn.ts:57`); Lichess import asks `clocks=true` (`src/game/importBatch.ts:114`) | Absent in untimed games and pasted PGNs without `%clk` |
| Time spent per move | **Derivable**: previous own `clockMs` − this `clockMs` + increment (from `timeControl`, "180+2") | Not stored |
| Opponent rating | **Stored** for bots (`PlayerInfo.elo`) and imports with `WhiteElo/BlackElo` | Missing for local two-player |
| Own rating at game time | **Server only** for rated games (`RatingEvent.ratingBefore`); imports carry it in the Elo header | Not on the client record |
| Which side is "me" | **Derived**, three near-identical helpers: `personColor` (`src/account/gamesList.ts`), `userColorOf` (`src/puzzles/harvest.ts`), `userColorFor` (`src/account/gameSync.ts`) | Null for two people at one screen |
| Win % before/after, loss, accuracy, label, best move | **Stored** in `GameReview.moves[]` / `positions[]` (`src/review/types.ts`) | Reviewed games only |
| Review depth | **Stored** (`GameReview.depth`, plus per-position `depth` after "Analyse deeper") | |
| Classifier rules version | **Missing**: `version: 1` is the shape, not the `REVIEW.loss` thresholds | Labels are frozen at review time |
| Opening ECO/name, book plies | **Stored** in `GameReview.opening`; unreviewed games use `lookupBook` on screen | |
| Mistake kind (hanging, fork, missed/allowed mate, missed free piece) | **Computed on screen only**: `caption()` in `src/review/captions.ts` returns an English sentence | No enum, nothing stored |
| Game phase | **Missing** | Derivable from material on each FEN |
| Practice / rated | **Stored** (`practice`, `rated`) | Hints/takebacks used per move: not stored |
| My-mistakes schedule, training log | **Synced** (`rookery.mistakes`, `rookery.trainingLog`, `src/sync/keys.ts`) | Later: "did the training fix it" |

**The storage limit matters.** `rookery.games` keeps **100 games** (`HISTORY_LIMIT`, `src/game/storage.ts`).
A reviewed record holds a FEN and a principal variation for every position, roughly 20–40 KB per game,
so 100 reviewed games already come close to the ~5 MB localStorage ceiling. The server keeps every game
(`Game.record` JSON, review included). The client pulls only summaries (`GET /api/games`) and single records.

## 2. Derived model: one fact per move

One compact row per **own** move of a reviewed game. Pure functions in a new `src/insights/` (no React),
in the same style as `src/account/openingsReport.ts`.

```ts
type MoveFact = {
  g: string;                     // game id
  ply: number;
  phase: 'O' | 'M' | 'E';        // within book plies -> O; non-pawn material under threshold -> E; else M
  winBefore: number;             // mover's win %, from the review
  loss: number;                  // win % given away
  band: 'won' | 'better' | 'equal' | 'worse' | 'lost';   // winBefore bands (tunable)
  clockMs?: number;              // time left after the move
  spentMs?: number;              // derived; needs the previous own clock
  motif?: 'hang' | 'fork' | 'mateMissed' | 'mateAllowed' | 'freeMissed';
  piece?: 'p' | 'n' | 'b' | 'r' | 'q';
};
type GameFact = {
  g: string; playedAt: string; color: 'w' | 'b'; result: string; tc?: string; category?: string;
  oppElo?: number; myElo?: number; eco?: string; opening?: string; practice: boolean; depth: number; fv: number;
};
```

- The label is **not** stored on the fact. It is recomputed from `loss` with the current `REVIEW.loss`, so a
  threshold change needs no new review. Phase, band and motif thresholds go in `tunables.ts` as `INSIGHTS.*`.
- **Motif needs one refactor.** Split `caption()` into `captionFact(i) → {kind, piece, square, san} | null`
  plus a renderer. Review keeps its sentences and Insights gets the enum. There is no new chess logic, and
  only moves a rule can prove get a motif. "Unexplained" stays an honest bucket.
- **Versioning.** Each fact carries `fv` (`INSIGHTS.factsVersion`, bumped whenever a phase or motif rule
  changes) and the review's depth. Cache key: `gameId : review signature : fv`. Rebuilding is cheap (chess.js
  only, no engine: a few ms per game), so the policy is *invalidate and rebuild*, never migrate. A deeper
  re-review changes the signature and rebuilds that game.
- **Mixed review depths.** Games reviewed at `fast` (12) and `deep` (20) are not equally precise. Show the
  depth spread, and leave fast reviews out of accuracy comparisons or flag them.

## 3. Where it is computed and stored

| Option | Verdict |
| --- | --- |
| Compute in the browser from `rookery.games` when the page opens | **MVP.** No schema change and works offline (CLAUDE.md rule). Limited to the 100 games on the device. |
| Cache facts in localStorage | **No.** The games already use up the quota. Use **IndexedDB** (`rookery-insights`): about 60 B × 40 moves × 1 000 games ≈ 2.5 MB, which fits easily. |
| A `UserState` key | **No.** Each key is one JSON row, merged as a whole. Facts are derived data, not state, and a cache should never be synced. |
| Server: new `MoveFact` + `GameFact` tables | **Phase 2, for signed-in players.** The server already holds every reviewed record. A pure, shared `buildFacts()` (shared the way `src/sync/keys.ts` is) runs on `PUT /games/:clientId` and fills tables indexed `(userId, phase)` and `(userId, motif)`. This covers the full history, not just the last 100 games. A startup job rebuilds them when `fv` changes. |

Phase 2 also adds `GET /api/insights?since&category&source`, which returns aggregates, not facts. The browser
should never download thousands of rows. Deletion works as it does now: `onDelete: Cascade` from `Game`.

**Coach visibility.** Linking a coach already shares the student's games (`server/src/routes/coach.ts`, 404
without a link). Insights are derived from those same games, so a linked coach seeing them exposes no new
data, but it is a *new view* of the student. My recommendation: the coach sees the student's Insights on the
coach page, behind the same `linkedStudent()` check. While a link is active, the student's Insights page says
"Your coach can see this". Unlinking removes access at once, the same as for games. **TO-CONFIRM: Hannan.**

## 4. Feasibility of each insight family

| Family | Data ready? | Notes |
| --- | --- | --- |
| Accuracy by phase | Yes, once phase is derived | Easiest win: mean `moveAccuracy` per phase |
| Blunder motifs | Yes, after the caption refactor | Strongest link to training: motif → My mistakes filtered by motif, Lessons, Drills |
| Converting winning positions | Yes | Reviewed games where own `winBefore` stays ≥ X for ≥ N plies but the result isn't a win |
| Opening performance | Already built | `openingsReport` covers it. Insights should link to it, not duplicate it |
| Time trouble | Partly | Only games with clocks. Measure the error rate when `clockMs` is under ~10% of the base time. Bot and Lichess games qualify; pasted PGNs mostly don't |
| Tilt / streaks | Yes, no review needed | Uses `playedAt` and result; `src/game/lossStreak.ts` already counts streaks. Accuracy after a loss vs after a win needs reviews |
| Compared with your rating band | Weak | `ACCURACY_BANDS` is a hand-made table, not calibrated (SPEC Phase 4 calibration is still open). Label it "rough guide" or hold it back |
| Trends over time | Yes, with enough games | Show a rolling window, not one point per game |

## 5. Statistical honesty

- Every figure shows its **n** ("from 14 games, 212 moves").
- Minimums (`INSIGHTS.minSample`, tunable): at least 10 reviewed games and 30 qualifying moves, and at least
  8 events for a motif or conversion rate. Below that, show "Not enough games yet: review N more" with a
  Review all button (`src/app/batchReview.ts`).
- Rates show a **Wilson 95% interval**. A comparison sentence ("you lose more in endgames") appears only when
  the two intervals don't overlap. Otherwise show the numbers with no sentence.
- Practice games are excluded by default. Filters cover bot vs human and time category.
- Reviewed games are a biased sample, because people tend to review their losses. Show "reviewed X of Y
  games" beside every figure that depends on reviews.

## 6. MVP and build order

1. **Shared helpers.** One `myColor(record)` to replace the three variants, and the `captionFact()` split.
   Unit tests prove the Review sentences are unchanged.
2. **`src/insights/facts.ts` + `aggregate.ts`** (pure), including the sample-size and interval logic.
   Unit-tested on fixture games.
3. **`#/insights` page**, browser-only over `rookery.games`: accuracy by phase, motif counts, conversion, and
   time trouble when clocks exist. Each card links to its training: My mistakes filtered by motif, endgame
   drills, the opening trainer, Review all.
4. **IndexedDB fact cache** with `fv` invalidation, once the page feels slow.
5. **Server facts + coach view**: a migration, `GET /api/insights` and `GET /coach/students/:id/insights`.
6. **Trends and rating-band comparison**, after the Phase 4 calibration.

## TO-CONFIRM

| Question | Owner |
| --- | --- |
| Can a linked coach see Insights, or only the games? | Hannan |
| Do imported games and bot games share one view by default, or stay separate? | Hannan / BA |
| Phase boundary rule (material threshold or ply count), and the "winning position" threshold | Chess SMEs |
| Is the 100-game local limit acceptable for the MVP, or does step 5 have to come first? | Hannan |
