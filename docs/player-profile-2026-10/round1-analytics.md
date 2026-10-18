# Round 1: analytics SME — can we detect "what kind of player you are" honestly?
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

## The short answer

Partly. At club level, most of what looks like "style" is really skill, the positions the player reaches, and the
time control. A raw count ("34% of your moves are forcing") is honest. "More aggressive than typical" is honest only
when the positions are held fixed. The best baseline for that is already in Rookery: **Maia at the player's rating,
in the player's own positions.** Lichess norms by rating band compare different positions. Every trait below is a
number with a 90% interval and a comparison point, never a personality label.

## What the code holds, and one gap

The facts (`src/insights/types.ts`) give phase, win before and after, loss, motif, clock, conversion and save
episodes, and ECO. `findSacrifice()` in `brilliant.ts` works on any move. `MaiaMatch` stores a log-likelihood curve
over the coarse grid from 600 to 2600. **The gap:** the review already runs `multiPV: 2`, and `classify.ts` reads the
second line, but `PositionReview` keeps only the best line. Storing the second line's score costs no engine time. It
unlocks `critical` (already a stub), "pressure created" and rushed critical moves.

## Trait definitions

*m* = an own move that is not book, played with winBefore ≥ 10. Every trait uses the existing Insights hygiene and is
split by speed and by human vs bot.

1. **Phase profile and converter vs fighter**: these exist already. Error rate per 100 moves by phase, and the
   shrunk conversion and save scores (≥ 8 episodes). Both are compared with the player's own pooled rate only.
2. **Time-use profile.** Pace is the median of `spentMs / (base/40 + inc)` over moves 10–40. The time-trouble rate
   is the share of games with any `timeTrouble` move, with a Wilson interval. This needs clocks: Step 0 found 0 of 14
   games with clocks on one account, so fix that first.
3. **Opening breadth.** The effective number of openings is exp(H), where H is the entropy of the ECO-family shares,
   with the Miller–Madow correction. It needs ≥ 20 games per colour and labels at ≤ 2 / 2–5 / > 5
   (narrow / mixed / wide).
4. **Plays like ~X.** Sum the per-game curves (`avgLogLik × moves`) on the shared grid, fit the peak, and bootstrap
   over games for the interval. Show it as a range beside Glicko. It stays uncalibrated until Phase 4.
5. **Forcing share (descriptive).** f(m) = 1 for a capture, a check, a sacrifice (`findSacrifice` net ≥ 1), or a
   pawn advance into the enemy half on or next to the enemy king's file. A = mean f(m). This needs only chess.js and
   a facts version bump.
6. **Aggression vs Maia (positions held fixed).** E = mean over m of Σ p_Maia,R(m′)·f(m′), with R from trait 4.
   Report A − E with a bootstrap interval clustered by game; moves within a game are correlated. Cost: one Maia
   evaluation per own move, about 1/8 of a match.
7. **Simplification.** A trade is a capture recaptured on the same square, with equal SEE. Count trades per 100 moves
   ahead (winBefore ≥ 70) and behind (≤ 30), and report the ratio with a log-scale interval. The player's own data is
   enough here, because trading when ahead is simply correct.
8. **Pressure created.** The share of own moves after which the opponent's best reply beats its second best by at
   least `REVIEW.greatGap`. It needs the stored second line and is a trend only.
9. **True risk appetite.** Choosing the sharper of two near-equal moves needs multiPV ≥ 3 and a search of every
   candidate: 2–3× the review time.

**From trait to improvement:** traits describe, and the ledger prescribes. The join worth shipping is *cost by type*:
mean loss on forcing moves vs quiet ones, with a 90% interval on the difference. It feeds the existing Focus rather
than competing with it.

## Reliability

Style features vary mostly within a game, so the per-game reliability ρ₁ is low. I guess 0.05–0.15; measure it by
split-half on odd and even games once someone has 60 or more. Spearman–Brown gives
n = ρ*(1−ρ₁) / (ρ₁(1−ρ*)). For ρ* = 0.8 that is **36 games at ρ₁ = 0.1 and 76 at 0.05**. So the gate is **40 games per
speed** for style traits, against 20 for the Focus.

**Flip test:** add 10 simulated games at the 5th and at the 95th percentile of the per-game distribution. If either
changes the label, show "leaning". The display is a dot with a 90% bar, plus a grey Maia band where one exists, in
three states: *clear / leaning / not enough games (n of 40)*. Comparison words appear only when the interval of the
difference excludes 0.

## Baselines

- **Own games:** time, phases, conversion, trades, pressure. Available now.
- **Engine:** loss and critical moves. Available now.
- **Maia-R in the same positions:** the honest "typical player". Its per-feature calibration is unproven; check it in
  Phase 4 against games at known ratings.
- **Lichess band norms:** an offline pipeline, later. Fine for context lines ("players at 1500 play about 4 openings
  as White"), but never for "more X than typical".

## Proposal

| Trait | Verdict | Gate | Cost |
|---|---|---|---|
| Phase profile, converter vs fighter | **Ship** | existing | none |
| Time-use profile | **Ship** | 20 clocked games per speed | fix clock capture |
| Opening breadth | **Ship** | 20 games per colour | none |
| Plays like ~X (pooled) | **Ship** | 20 matched games | pooling |
| Forcing share + cost by type | **Ship** (descriptive) | 40 games | facts bump |
| Store the second-line score | **Do now** | — | zero engine time |
| Aggression vs Maia | **Later** | 40 games, interval excludes 0 | 1 Maia evaluation per move |
| Simplification, pressure created | **Later** | 40 games | chess.js / second line |
| Lichess band norms | **Later** (Phase 4) | — | offline pipeline |
| True risk appetite | **Never** by default | — | 2–3× review time |
| Archetypes ("attacker", "Tal-like"), "positional" from the `other` bucket | **Never** | — | unexplained ≠ positional; one label hides several traits and flips |
