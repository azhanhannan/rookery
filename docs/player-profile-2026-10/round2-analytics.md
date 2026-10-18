# Round 2: analytics SME replies
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

## 1. The second line: product overestimated, the cost is storage

I checked the code, and the review already searches two lines per position:

- `src/config/tunables.ts:43` sets `REVIEW.multiPV: 2`.
- `src/review/reviewRunner.ts:69,79` passes it to `engine.analyze(fen, { depth, multiPV })`. Bulk import and
  `deepen.ts:99` go the same way.
- `src/review/classify.ts:46-49` (`isGreat`) reads `lines[1]` to award "Great".
- `src/review/buildReview.ts:18-20` (`toPosition`) keeps only `lines[0]`. **This is where the second line is dropped.**

So product's step 3 ("MultiPV 2 slows each position, 2–3 days") prices search time we already pay. The real work:

- **Code:** add `second?: { move; score }` to `PositionReview`, and derive `MoveFact.critical` in `facts.ts`. That is
  under a day with tests.
- **Storage:** about 40 bytes per position, so about 3 KB per 80-ply game. That is small next to the `bestLine` PVs a
  review already stores. The second line belongs in the review, not in the ~1 KB facts. Facts keep only the boolean.
- **Versions:** bump `GameReview.version` from 1 to 2. Without it, a missing second line in an old review looks the
  same as a position with only one legal move. Also bump `INSIGHTS.factsVersion` from 1 to 2 (the cache rebuilds; the
  server backfills).
- **Old reviews** have no second line. Only a re-review fills them, at full engine time (the analysis cache is in
  memory only). Fold this into the depth-16 re-review already decided; until then, lines that need `critical` say
  "needs re-review".

## 2. Bots: split by opponent type and by trait (I partly disagree with the coach)

"Humans only" would leave Hannan with nothing. The question is whether a trait measures *the player's own
decisions* or depends on *how the opponent behaves*.

- **Valid against any opponent, filtered by type:** phase error rates, checking the opponent's threats, clock use,
  the "plays like ~X" fit, and the share of moves left after book.
- **Depends on the opponent:** conversion and saves, forcing share, trades, and the after-loss line. The weakened
  Stockfish bots (`pBlunder` up to 0.25) hang pieces at random. That inflates captures and conversions, and full
  Stockfish never gives a save back. **Maia bots** were trained on human games and are the closest stand-in for a
  human.

**Rule:** compute three groups, human, Maia bot and Stockfish bot, and never pool Stockfish bots into a trait that
depends on the opponent. Human and Maia-bot games may be pooled, with a label saying so ("vs people and Maia bots").
Every line names its group. This is the coach's principle, made workable.

## 3. Gates: two tiers (agree with the coach)

- The section opens at **20 reviewed games**.
- Traits that Insights already gates show as soon as their own gate passes: phase difference, conversion and saves
  (8 episodes), clock (15 clocked games), threat-checking (30 moves and 8 events), opening (10 games).
- **Style counts** wait for **40 games per speed and group**. Until then, Club and Analyst see "n of 40"; Learner
  sees nothing.

## 4. Style labels: I narrow my proposal (the coach is mostly right)

Below about 1800, the raw forcing share mostly measures how often opponents hang pieces. **I drop it as a trait.**
I keep two narrower things:

1. **Cost by type (a habit, not a style):** "your forcing moves give away 1.8 points per 100, your quiet moves 0.9",
   shown only when the interval of the difference excludes 0. Coach-compatible: verb phrasing, and it points at the
   Focus.
2. **Aggression vs Maia:** this does hold the positions fixed, which answers "your opponents hang pieces". But its
   calibration feature by feature is unproven. **Analyst only, after Phase 4 validation, a number rather than a
   label.**

I adopt the coach's **Maia fit by phase** and the Analyst-only "how your games end" line. I agree with product on
placement (a private section of `#/insights`, with Focus as the only action). Their step 3 is now cheap, so it should
come before step 2.

## 5. Final list

| Trait (verb phrasing, dated, "describes recent games") | Verdict | Gate | Opponents |
|---|---|---|---|
| Where your games are decided (phase) | **Ship** | existing; interval of difference excludes 0 | any group, filtered |
| Checking their threats | **Ship** | 30 moves, 8 events | any group |
| Finishing won games / saving worse ones | **Ship** | 8 episodes | human + Maia bot |
| Clock use | **Ship** | 15 clocked games per speed | any group |
| Opening approach and breadth | **Ship** | 10 games per row; breadth needs 20 per colour | any group |
| Store the second line + `critical` | **Do now** (< 1 day, review v2, facts v2) | — | — |
| Plays like ~X, pooled; Maia fit by phase | **Later** (Analyst, "uncalibrated") | 20 matched games; 150 moves per phase | any group |
| Cost by type (forcing vs quiet) | **Later** | 40 games per speed | human + Maia bot |
| Rushed critical moves, pressure created | **Later** (after re-review) | 40 games | any group / human + Maia bot |
| How your games end | **Later** (Analyst) | 40 games | human + Maia bot |
| Aggression vs Maia, trades ahead vs behind | **After Phase 4** (Analyst, number only) | 40 games | human + Maia bot |
| Raw forcing share as a trait; true risk appetite | **Never** | — | — |
| Archetypes, "positional" from `other`, rating-band labels | **Never** | — | — |
