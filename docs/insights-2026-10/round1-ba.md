# Insights, round 1: Business Analyst view
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

Rookery is a personal hobby app, so "value" here means a player's time and points, not money. "Effort" means Hannan's evenings.

## 1. The problem, before any solution

**Need:** "I keep losing points and I don't know which *one* habit to fix first."

| | As-is (today) | To-be |
|---|---|---|
| Diagnosis | You review games one at a time. A pattern (always hanging a piece after castling, always collapsing under 30 s) only shows up if you remember it across 20 reviews. | Rookery reads all your reviewed games and names the 1–3 things costing you the most, each with a sample size. |
| Prescription | My mistakes, endgames, openings and lessons all exist, but you choose what to train by mood. | Each insight ends in **one button** that opens the drill that already exists for it. |
| Check | Nobody checks whether the training helped. | The same insight, recomputed later, shows whether that mistake type got rarer. |

**Steps that go away:** choosing what to train, and keeping mistake patterns in your head. **Step added:** reading one card. That trade is worth it only if the card is short. A dashboard you have to interpret adds a step and removes none, so it fails this test.

## 2. Who decides what with it

| Persona | Decision the insight serves | What they must NOT get |
|---|---|---|
| **Aina (~600)** | "What's my one thing this week?" (almost always loose pieces) | A list of 12 weaknesses or a red accuracy trend. One sentence, framed as progress. |
| **Daniel (~1500)** | "Which opening or phase leaks the most, and is it time trouble or knowledge?" | Blitz games mixed into rapid conclusions |
| **Farid (~2250)** | "Is my loss in conversion, time use or the opening, and by how much win chance?" | Unproven captions. He wants numbers and sample sizes. |
| **Rahim (coach)** | "What homework do I give this student?" The student's insights would be his intake form (the coach link already shares the games). | Stats he can't open the games behind |

## 3. What already exists to reuse

A lot of the data layer is already built. Each stored `GameReview` holds per-move `label`, `loss` (win-chance lost), `accuracy`, `bestSan`, and per-position evals and `winWhite`. `MoveRecord.clockMs` stores the clock for games played in Rookery. `timeControl`, `opening` (ECO/name), `userColor`/`userColorOf`, `rated`/`practice`, and `openingsReport.ts` (results and median first wrong move per opening) are all there. So are the caption rules in `captions.ts` (hanging piece, fork, missed/allowed mate, missed free piece), My-mistakes harvesting and its spaced-repetition schedule (`stage`, `retired`), the training log by kind and day, and `reviewFits`, which filters out stale reviews.

**Gap:** a caption is saved only as an English sentence (`explanation`), not as a motif tag. Counting "hanging piece × 9" needs the caption rule to also return a `kind`. This is small, and almost every useful insight depends on it.

## 4. Candidate features, value vs effort

Effort is my estimate in solo evenings, not a measurement.

| # | Insight | Value | Effort | Reuses | Ends in a drill? |
|---|---|---|---|---|---|
| A | **Mistake-type breakdown** (hanging piece / allowed fork / missed mate / missed free piece / unexplained), as a share of win chance lost | High, all levels | 1–2 (needs the motif tag) | captions.ts, review.moves | Yes: My mistakes filtered to that type |
| B | **Phase leak:** win chance lost in the opening / middlegame / endgame | High (Daniel, Farid) | 1 | `loss`, ply, material from the FEN | Yes: opening trainer / endgame drills |
| C | **Opening leak** (already a report): flag the worst opening by score and median first wrong move | Medium-high | 0.5 (show it again) | openingsReport.ts | Yes: opening trainer for that line |
| D | **Clock leak:** blunder rate with under 10% of the base time left vs above it | High for Daniel | 1 | clockMs, timeControl | Partly: suggest a slower time control or threat check |
| E | **Repeat offenders:** the same motif coming back in real games after its puzzle retired | High (it proves whether the loop works) | 1 | SR schedule + motif tag | Yes: reopen the card |
| F | **Conversion:** games where your win chance reached 80% or more and you didn't win | High (Farid, Daniel) | 1 | positions.winWhite, result | Yes: endgame "convert" drills |
| G | Accuracy / rating trend chart | Low (vanity) | 0.5 | RatingHistoryChart | No |
| H | Comparison against peers at your rating | Medium | High (needs population data we don't have) | none | No |

G and H are cut. G moves with opponent strength and tells you nothing to do. H needs data Rookery doesn't have, and it shouldn't be faked.

## 5. Make vs reuse, and where Rookery is different

- **Lichess Insights** is powerful but is a query builder (pick a metric × a dimension). It's great for Farid and too much for Aina, and it doesn't send you to a drill.
- **Chess.com Insights** (paid tier) is mostly accuracy, phase and opening charts. It's descriptive and ends at the chart.
- **Aimchess** comes closest. It scores skill areas and recommends drills, but it's a separate paid service and its drills aren't your own positions.

(I described these from general knowledge and didn't check them this round. If the comparison matters, verify it.)

**Rookery's edge** is the loop it already owns end to end: **insight → drill built from your own mistakes → spaced repetition → insight re-checked in real games.** Don't rebuild Lichess's query builder. Build a few opinionated cards that each link to a drill.

## 6. What "it worked" looks like

| Measure | How Rookery can see it | Not this (vanity) |
|---|---|---|
| **Insight → action:** share of cards followed by that drill within 7 days | training log + a "Train this" click | Insights page views |
| **Motif recurrence falls:** e.g. hanging pieces per 100 moves, last 20 reviewed games vs the 20 before | motif tags over time | lifetime accuracy |
| **Retired cards stay retired:** the motif doesn't come back in real games | E above | total puzzles solved |
| **Rating moves with it:** Glicko trend over 30+ rated games, as context only | accountRating | one game's swing |

Bar for success (my judgement, not a standard): on Hannan's own account, the top motif's rate is visibly lower after about 4 weeks of following the cards. If it isn't, the feature is decoration.

## 7. Risks and guards

| Risk | Guard |
|---|---|
| **Small samples:** "you lose 80% of Caro-Kanns" from 5 games | Show *n* on every number. No card below a minimum (say 10 reviewed games, or 5 cases of a motif; make it a tunable). Below that: "Review N more games to unlock this." |
| **Demotivating beginners** | Learner style: one card, written as a goal ("Loose pieces cost you the most points, so let's fix that"), no red numbers, and a "this got better" card first when there is one. |
| **Misleading stats** | Mixing blitz with rapid, practice with rated, and bot games with imports. Default to your games split by speed, practice excluded. Motifs come only from proven captions, and the "unexplained" share is shown honestly, not spread across the other types. |
| **Stale or uneven reviews** | Count only reviews that `reviewFits`. Never mix depths in one trend. |
| **Goodhart (training the metric)** | Measure recurrence in real games, never puzzle scores. |

## 8. Top 5 and the MVP slice

**Top 5:** (1) A Mistake-type breakdown, (2) B Phase leak, (3) F Conversion, (4) D Clock leak, (5) E Repeat offenders. C is nearly free, so fold it in as a card rather than treating it as a feature.

**MVP slice:** one `#/insights` page with **at most three cards**, ranked by win chance lost. Each card shows its sample size and a "Train this" button. The cards come from A (once captions return a motif tag), B, and the existing C. Filters: speed, and practice in/out. A minimum-sample gate applies, and the Review style setting decides the wording. No charts. D and F come next. E goes last because it needs weeks of history before it can show anything.

**What would make me wrong:** if most reviewed games are imported without clock data, D is dead. If most mistakes come back "unexplained" by the caption rules, A is thin, and B (which needs no caption rules) should lead instead. **Count both on real saved games before building.**
