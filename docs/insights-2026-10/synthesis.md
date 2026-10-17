# Insights panel — synthesis (18 Oct 2026)

Panel: BA, SA, SME coach, SME analytics. Two rounds; the eight papers are in this folder
(`round1-*.md`, `round2-*.md`). This file is the agreed position plus what is still Hannan's call.

## Agreed

- **Page shape.** `#/insights`. The points-lost ledger (win-chance loss, pooled over moves, by phase × motif)
  is the ranking engine. Buckets rank by the 90% lower bound of points lost per game after shrinkage (k = 10).
  The top *eligible* bucket is the pinned **Focus** (eligible = enough data, has a drill, testable in 15 games;
  "other" can never be Focus). Shown by Review style: Learner = Focus only; Club = Focus + 1 Watch card;
  Analyst = top 3 cards + full ledger. Each card shows *n*, its evidence positions (the "deciding moves"),
  and a **Train this** link into an existing tool.
- **Re-test (was the main dispute).** Analytics' design, accepted by coach and BA: baseline frozen and shrunk
  when the Focus starts; only games after the start count; rate per 100 moves; window ≥ 15 games and ≥ 2 weeks.
  States after each game: *too early* / *on track* (≥ 80% the rate dropped) / *not yet* / verdict at window end
  ("improved" needs 95%). Drill and lesson completion shown from day one. Long-term trend = Bayesian slope,
  ≥ 40 games, 90% interval excludes 0. No last-N vs previous-N comparisons anywhere.
- **Move filter.** Ledger uses every non-book move; error rates exclude only already-lost positions
  (win chance before < 10%). The 10–90% window is for accuracy comparisons only. (Coach's catch: the original
  filter dropped the move that throws away a won game.) **SA round 2 still says 10–90% — superseded.**
- **Hygiene.** Review depth ≥ 16; drop unfinished games, < 10 own moves, flag/abandon losses where not worse,
  practice games (takebacks not recorded); split human vs bot and by speed; "reviewed X of Y" beside figures.
- **Motifs shipped:** proven captions + tablebase-wrong moves + ignored threat + back-rank mate, plus (coach)
  lost on time while better and stalemate given away while winning. Not shipped: pins, skewers, positional themes.
- **Not shipped:** accuracy/rating trend charts, rating-band comparisons (until Phase 4 calibration).
- **Data model.** Per-game ~1 KB versioned facts record in IndexedDB (SA + analytics), incl. per-move
  `winAfter`, `inBook`, `critical`, `oppThreat`, conversion/save episodes, after-loss flag, and a short list of
  notable moves. Synced `rookery.focus` key holds baseline snapshot, target, window. Server tables later.

## Thresholds (`INSIGHTS.minSample` in `src/config/tunables.ts`)

| Gate | Value |
| --- | --- |
| Page unlocks | 10 reviewed games ("early read" until 20) |
| Rate card | 30 moves and 8 events |
| Focus | 15 games, 8 events, testable *(coach wanted 20 — open)* |
| Conversion / saves | 8 episodes |
| Opening row | 8–10 games *(analytics 8, SA 10 — pick one)* |
| Trend | 40 games |
| Intervals | 90%; comparison sentence only when the interval of the difference excludes 0 |

## Decided by Hannan (18 Oct)

1. Bulk "Review all" moves to depth 16; existing depth-12 reviews are re-run once in the background.
2. Coach visibility: yes, after the MVP — same link check as games, "Your coach can see this" notice, coach can
   override the Focus.
3. After-loss line: ship analytics' strict descriptive version (≥ 15 after-loss games, 90% interval of the
   difference excludes 0, never "tilt"/"because", muted on Learner). Record game end time + takebacks now.
4. Focus needs ≥ 20 reviewed games (plus analytics' shrinkage, lower-bound ranking and testability gate);
   opening row needs ≥ 10 games ("early read" until 30).

## Step 0 result (18 Oct, local dev DB)

Only 25 games on the local server (two accounts, 14 + 11), 6 reviewed — indicative, not conclusive.
- Clocks: 11 of 11 on one account; 0 of 14 on the other, although 12 of those 14 had a time control (check why).
- Review depth: 4 of 6 reviews at depth 12 — the depth ≥ 16 rule would drop two-thirds without decision 1.
- Caption coverage, own Mistake/Blunder/Miss (practice excluded): 17 of 35 explained (49%), carrying 56% of the
  win chance lost; in lost games 14 of 26. Explained kinds: undefended piece left, piece lost to a cheaper one,
  missed mate in 1–2, missed free material. So the motif card works but "other" is about half — the phase card
  must sit beside it, as BA predicted.

## Original open calls (now decided above)

1. **Bulk "Review all" depth.** `src/app/ImportPage.tsx:282` reviews at depth 12, so the depth ≥ 16 rule drops
   every bulk-reviewed import. Raise it to 16 (BA's unmeasured estimate: ~1.5 h background per 100 games)?
2. **Coach visibility.** All four lean yes: same link check as games, "Your coach can see this" notice,
   coach can override the Focus (`CoachFocus` table, `GET /coach/students/:id/insights`). After the MVP.
3. **After-loss line.** Split: analytics/coach would ship a descriptive, opt-in, non-Learner line
   (≥ 15 after-loss games, interval excludes 0, never "tilt"/"because"); BA/SA say not yet (too few games).
   Either way: start recording game end time and takeback count now.
4. Focus gate 15 vs 20 games; opening row 8 vs 10 games.

## Build order

0. Pre-build counts: share of games without clocks (SQL); share of losses the caption rules can't explain and
   spread of review depths (throwaway script over exported games). If unexplained losses dominate, phase leads.
1. Refactor `caption()` (`src/review/captions.ts`) into a typed `captionFact()` (kind, piece, square) + text; `myColor()` helper.
2. Pure facts + aggregation modules (versioned), with unit tests.
3. `#/insights` page: ledger, Focus/Watch cards by Review style, *n* everywhere, Train this links.
4. Focus record + re-test states; record game end time and takebacks.
5. IndexedDB cache; bulk-review depth change (if approved).
6. Conversion/saves card, clock-pressure card.
7. Server tables + coach view.
8. Trends; rating-band comparison after Phase 4 calibration.
