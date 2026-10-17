# Insights — round 2, System Analyst

18 Oct 2026. Replies to `round1-ba.md`, `round1-sme-coach.md` (Rahim) and `round1-sme-analytics.md`.
I checked three facts in the code before writing this, and each one changes something below.

- **Import's "Review all" runs at depth 12.** `src/app/ImportPage.tsx:282` calls
  `startBatch(..., REVIEW.depth.fast)`. The analytics chair's depth ≥ 16 filter would therefore drop
  every bulk-imported game reviewed from the Import page.
- **Takebacks are not recorded.** `src/game/practice.ts` removes the plies and leaves no counter on
  `GameRecord`.
- **There is no end time.** `createdAt` is set when the game starts (`src/game/rules.ts:23`). Nothing records when it ends.

## 1. Data model: one per-game facts record, plus a short list of notable moves

**I drop my per-move fact rows and accept analytics' per-game `insightFacts`, with two changes.**

1. **Add an `events[]` list.** Rahim's coach view needs the 5 deciding positions, BA card A needs the
   My-mistakes "filter by motif" link, and the re-test needs per-motif counts. Per-game sums can't name a
   move. So the record also keeps every contested own move with `loss ≥ 10`, plus the deciding move
   (the largest loss), each as `{ply, phase, loss, tag, clockMs?, spentMs?, critical, fast}`. That is
   3–8 entries a game, and keeps the record at 1–2 KB.
2. **Don't store it on `GameRecord`.** analytics proposed keeping it on the record, but `rookery.games`
   is already near the localStorage quota (round 1), and anything on the record gets uploaded and becomes
   stale on the server when `factsVersion` changes. Store it in **IndexedDB**, keyed
   `gameId|reviewSignature|factsVersion`, with a matching server table later (§5).

**Filters**, all in `INSIGHTS.*`, applied before any metric:

| Filter | Setting |
| --- | --- |
| Review depth | ≥ 16 (analytics). **Condition:** change Import's Review all to `normal`, or most imported games never qualify. Hannan decides. |
| Contested moves | own, non-book, 10 ≤ winBefore ≤ 90 (analytics) |
| Game exclusions | result `*`; fewer than 10 own moves; time/abandon losses with win% ≥ 40 when the flag fell; **all practice games** (analytics wanted only practice games *with takebacks*, which can't be told apart today; add `takebacks?: number` to `GameRecord` so that rule can apply later) |
| Opponent split | human vs bot from the opponent's `PlayerInfo.isBot`. Imported games count as human. Bot Elo is shown as "bot-label Elo". |
| Phase | analytics' simplified Divider: opening = up to `max(bookPlies, middlegame start)`, with middlegame starting at ≤ 10 non-pawn pieces or a back rank with ≤ 3 of its original pieces, and a hard stop at ply 30; endgame at ≤ 6 non-pawn pieces or ≤ 7 men in total. This replaces my round-1 material-only rule. |

## 2. Improvement claims: both, used for different things

Rahim's re-test ("6 of 20 → 2 of 18") is the **focus** number. analytics' Bayesian slope (≥ 40 games)
is the **long-trend** number. I agree with analytics that "last 10 vs previous 10" is noise, so a
re-test says "fewer so far" unless the 90% Wilson intervals separate. Only then does it say
"improved". Rahim keeps his motivating number, analytics keeps the honest wording.

What has to be stored, as a **`rookery.focus`** synced key (`stamped`, newest wins):

```ts
type Focus = {
  id: string; key: string;            // e.g. 'motif:fork' | 'phase:E' | 'conversion' | 'clock'
  startedAt: string; retestAfter: string; endedAt?: string;
  setBy: 'self' | 'coach'; factsVersion: number;
  baseline: { gameIds: string[]; games: number; events: number; contestedMoves: number };
};
```

The baseline has to be a **snapshot**: the 100-game limit and any `factsVersion` bump both change what a
live recount would return. The re-test counts only games with `createdAt > startedAt`. If the baseline's
`factsVersion` differs from the current one, the before/after is shown as "rules changed, not
comparable". The trend slope needs no new storage, only `createdAt` and facts.

## 3. Tilt: a nudge yes, a statistic not yet

analytics is right that tilt can't be shown as a causal claim. The numbers also rule out Rahim's statistic
today. Around 45 losses in 100 games gives about 45 "after a loss" games, and per-game error rates are
too noisy for that to clear analytics' "interval excludes your pooled rate" bar. The "next game within
2 minutes" measure needs an end time, which isn't recorded.

**Decision:** keep the nudge, with no statistic attached, inside the existing loss-streak cushion
(`src/game/lossStreak.ts`, `LossCushion.tsx`). Start recording `endedAt` on `GameRecord` now, so a tilt
card can be judged on real data later.

## 4. Minimum samples, in `INSIGHTS.minSample` (tunables.ts)

| Key | Value | From |
| --- | --- | --- |
| `pageGames` | 10 qualifying reviewed games before any card shows | BA |
| `focusGames` | 15 before a Focus can be chosen: a prescription needs more data | Rahim |
| `contestedMoves` | 30 per metric cell | analytics |
| `gameRate` | 8 games (conversion, saves) | analytics |
| `openingGames` | 10 | analytics |
| `motifEvents` | 5 per motif before it can be a headline | BA (Rahim's 3 is too low) |
| `clockTrouble` | 30 moves in time trouble | analytics |
| `trendGames` | 40 | analytics |
| `earlyReadFactor` | 3 (show "early read" below 3 × minimum) | analytics |
| `shrinkK` | 10 | analytics |
| `z` | 1.645 (90%) | analytics. I withdraw my 95%. Shrinkage plus a fixed headline list handles multiple comparisons better than wider intervals. |

## 5. Coach view: what Rahim's asks need

| Ask | Impact |
| --- | --- |
| Deciding positions, 5 per focus | The coach can't run the student's browser, so this needs **server facts**: a `GameInsight(gameId PK→Game cascade, userId, factsVersion, facts Json)` table, filled on `PUT /games/:clientId` by the same pure `buildFacts()`, and rebuilt at startup when the version changes. New route `GET /coach/students/:id/insights` (aggregates + deciding positions `{clientId, ply, fen, tag, loss}`) behind `linkedStudent()`, answering 404 without a link. Comments per ply already exist (`CoachComment.ply`). |
| Assign homework from an insight | **No schema change.** The coach page builds `HomeworkItem`s from each position's FEN and `bestLine`. Optionally add `source: {clientId, ply, key}` to the item JSON, which means updating its validator. |
| Focus override | The coach can't write the student's `UserState`, so a new **`CoachFocus(coachId, studentId, key, note, createdAt)`** row, deleted on unlink. The student's app reads it through the existing coach endpoints. A coach focus outranks the student's own focus, and the student sees who set it. |

## 6. Revised build order

0. **Pre-build counts**, about an hour, no feature code (details below).
1. Replace `caption()` with `captionFact()`, which returns a typed motif, plus a renderer. Unify `myColor()`.
   Unit tests prove the Review sentences are unchanged.
2. `phase.ts`, `facts.ts` (with `events[]` and the exclusions), `factsVersion`; record `endedAt` and `takebacks`.
3. `aggregate.ts`: Wilson/Poisson intervals, shrinkage, the thresholds above.
4. `#/insights` MVP: the points-lost ledger by phase × motif (analytics #1, which covers BA's A and B),
   conversion, and the opening card linking to `openingsReport`. The clock card only if count (a) allows.
5. Focus + re-test (`rookery.focus`).
6. `GameInsight` table, `/api/insights`, coach view, `CoachFocus`.
7. New tags: ignored threat, tablebase-wrong move, back-rank mate.
8. Trends (≥ 40 games); the rating-band comparison after Phase 4 calibration; a tilt card once `endedAt` data exists.

**The pre-build counts (BA)**, plus a third one I'm adding:

- **(a) Games without clocks:** one SQL query on the embedded Postgres,
  `count(*) filter (where record->'moves'->0 ? 'clockMs') / count(*)` over `Game`, grouped by `rated` and
  by whether the opponent is a bot. No code needed.
- **(b) Losses the caption rules can't explain:** a throwaway `npx tsx` script that reads exported games
  (DevTools `copy(localStorage['rookery.games'])` into a scratch file outside the repo). For each loss,
  run `captionForMove` on the deciding move and count the `null`s. Pure chess.js, no engine.
- **(c) Review depth distribution:** the same script tallies `review.depth`. If most reviews are at 12,
  the depth ≥ 16 filter needs fixing before step 4.

These counts come from Hannan's own games only. They show whether the feature is viable; they don't
represent other players.

**TO-CONFIRM (Hannan):** whether Import's Review all moves to `normal` depth; whether to exclude all
practice games until takebacks are counted; whether a coach focus outranks the student's own.
