# Round 1: analytics chair (performance analytics SME)

Insights is maths stacked on top of maths that is already there. Before adding a single chart, these are the facts in the code
that limit what we can honestly claim:

- **The unit is already right.** `MoveReview.loss` is win-chance loss (Lichess logistic on cp, clamped at ±1000), not
  centipawns. Keep it. ACPL is dominated by the positions that are already decided: dropping +9 to +6 "costs" 300 cp and
  almost no points. Win-chance loss ≈ expected-score loss, so it adds up into "points thrown away".
- **Game accuracy is not Lichess's.** `gameAccuracy` takes the plain mean of the arithmetic and harmonic means, with no
  volatility weighting. That is fine for one game. Averaged across games it rewards short games and games that were
  decided early. Insights should pool **moves**, not average game accuracies.
- **Depth varies.** Reviews run at depth 12, 16 or 20, and "Analyse deeper" can raise single positions. Depth 12 both
  over- and under-calls blunders. The ensemble needs a consistent rule: count only reviews at depth ≥ 16 (`review.depth`),
  and keep deeper re-analyses (that is fine, it just means a better eval).
- **The baselines are placeholders.** `calibration.json` says `calibrated: false` and `ACCURACY_BANDS` is a guess.
  Every "vs your rating band" comparison stays hidden until the Phase 4 calibration exists (see Baseline below).
- **Data we already have that is gold:** `clockMs` on every move, `termination`, `bookPlies`, multiPV 2 (so we know
  when only one move holds), the proven-caption rules, Maia matching, the tablebase. We do not need any new engine work
  to ship v1.
- **Volume:** `HISTORY_LIMIT = 100` games locally. At 100 games a 1500 player makes about 3,500 moves, which is enough
  for rates per phase but not for rates per opening × colour × time control. The server has every game.

## Sample hygiene (applied before any metric)

Exclude: result `*`; games with fewer than 10 own moves (`RATING.minMoves`); losses on time or abandonment where the
player was not worse (win% ≥ 40) when the flag fell, since those are clock events, not chess; **practice games with
takebacks** (the played line is not the first choice); and games without a review at depth ≥ 16. Always segment
**human vs bot opponents**. Stockfish bots blunder at random by design, so "conversion vs bots" and "conversion vs
people" are different quantities. Bot Elo labels are nominal, not calibrated, so anything rating-based against bots is in
"bot-label Elo" and must say so.

## Phases (deterministic, cheap)

- **Opening:** plies up to `max(bookPlies, first ply where the middlegame starts)`.
- **Middlegame starts:** total non-pawn non-king pieces ≤ 10, **or** a side's back rank has ≤ 3 of its original pieces
  (this is Lichess's Divider idea, simplified). Hard stop at ply 30.
- **Endgame:** total non-pawn non-king pieces ≤ 6, or ≤ 7 men in all (tablebase territory).

**Contested moves only.** Losses shrink to almost nothing when the mover's `winBefore` is outside [10, 90], because the
curve is flat there. Every rate below is computed over contested moves C = {own, non-book moves with 10 ≤ winBefore ≤ 90}.
Without this filter, "your endgame accuracy is great" just means "your endgames are already decided".

## How we avoid lying

- **Rates get intervals.** For a proportion x/n use the Wilson interval (z = 1.645, i.e. 90%). For a per-100-moves rate
  with k events in m moves, use the exact Poisson interval (gamma quantiles).
- **Small cells get shrunk.** θ̂ = (x + k·μ)/(n + k), where μ is the player's overall rate and k = 10 (a tunable). An
  opening played 4 times with 100% then reads near the player's average, which is the truth.
- **Display thresholds.** Below n_min, show nothing. Between n_min and 3·n_min, show the figure with an "early read" tag.
  n_min is 30 contested moves for move rates, 8 games for game-level rates, and 10 games for openings.
- **Multiple comparisons.** With 20 numbers on screen, one will look significant by chance. Headlines come from a fixed
  short list, and a "weakness" claim needs its 90% interval to clear the player's own overall rate.
- **Baseline.** Maia cannot give a cheap baseline. "Expected loss at 1500" needs evals of Maia's top moves in every
  position, which means 3 extra shallow searches per position: a stretch goal. The realistic route is the Phase 4
  calibration script. Run it over a Lichess DB sample per rating band and ship static tables (blunder rate per 100
  contested moves, conversion, saves, phase loss), the same way `calibration.json` is shipped. Until then, compare the
  player only with **their own past**.

## Motif tagging: precise vs unreliable

**Ship (provable):** the existing caption rules (hanging piece, allowed mate in 1–2, missed mate in 1–2, fork, missed
free piece). **Tablebase-wrong move** (≤ 7 men: win→draw or draw→loss) has precision 1.0 by construction. **Ignored
threat:** the opponent's last move created a threat that the existing "show threat" logic detects, and the reply's loss
≥ 10. **Back-rank mate allowed:** a mate in 1–2 where the king is on its home rank behind its own pawns.

**Do not ship:** pins, skewers, discovered attacks or "positional" themes (weak squares, bad bishop, passivity) without
a board proof. "Tilt", and "time trouble caused this" as a causal claim. The rule stays the same as for captions: an
untagged loss goes into "other", never into a guessed bucket. Report the size of "other" so the coverage is honest.

## Trends without overfitting

Per metric, fit a Bayesian linear slope on game index, with a weakly informative prior centred on 0. Say "improving" only
when the 90% credible interval excludes 0 **and** n ≥ 40 games. The default sentence is "no clear change". A UI
alternative is an EWMA (λ = 0.1) drawn with its interval band, with no arrows. Never compare "last 10 vs previous 10".

## Compute

Reviews dominate the cost: depth 16 is about a minute per game, and `batchReview` already exists. Aggregation is
trivial **if** each review produces a small `insightFacts` record (about 1 KB) stored on the `GameRecord`:
`{factsVersion, reviewDepth, exclusions, phaseBoundaries, perPhase:{contestedMoves, lossSum, errors≥10, errors≥20},
captionLossByTag, peakWin, troughWin, sustainedAdv, sustainedDisadv, timeBins, criticalFastCount}`. Derive it from the
stored review plus chess.js (captions are cheap). Recompute lazily whenever `factsVersion` changes, with no engine
needed. Aggregate in the browser over the local 100 games, and on the server for the full history.

## My top 5 (exact definitions)

**1. Points-lost ledger: "where your points go".**
For each own move i ∈ C, let ℓ_i = loss_i/100 (expected score). Then
`ledger[phase][tag] = Σ ℓ_i / games`. Show the average points lost per game, split by phase × motif tag (provable tags
plus "other"). Example: "You give away 0.62 points a game; 0.21 in middlegame hanging pieces." This is the single
most actionable view, and it is additive, so the parts sum to the whole.

**2. Error rate per 100 contested moves, by phase.**
`E_phase = 100 · #{i ∈ C_phase : loss_i ≥ 20} / |C_phase|` (Mistake/Blunder threshold `REVIEW.loss.mistake`), with
an exact Poisson 90% interval. Also show the ≥ 10 (inaccuracy-plus) rate. Flag a phase as "weakest" only when its interval
lies above the player's pooled rate.

**3. Conversion and saves.**
An *advantage episode* starts when the player's win% is ≥ 67.6 (+2.0) on two consecutive own moves after ply 10 and
before the result. `Conversion = (W + ½D)/n_adv`, with Wilson CI and shrinkage toward the player's overall score.
*Saves* mirror this at win% ≤ 32.4 (−2.0). Count one episode per game, at the first trigger. Segment by human vs bot.
Add a "+3 threshold" variant (win% ≥ 75.2) as a check on the first.

**4. Clock pressure.**
Time spent: `t_i = clock_{i−1} − clock_i + increment`. In time trouble means `clock < max(30 s, 10% of base)`.
`RR = E_trouble / E_normal`, the ratio of the error rates (≥ 20) in those two states, with a log-RR interval; show it at
n_trouble ≥ 30. **Rushed critical moves:** a critical position is one where the multiPV gap is ≥ `REVIEW.greatGap` (only
one move holds). Report the share of those moves played in less than 50% of the player's median move time, and their
error rate compared with critical moves played slowly. Do not show a raw time-vs-loss correlation: hard positions cause
both long thinks and errors, so the sign misleads.

**5. Opening table with honest scores.**
Per opening family × colour: n; score `s = (W + ½D)/n`, shrunk with k = 10 toward the player's colour score; Wilson
90% interval; **performance rating**
`Perf = R̄_opp + 400·log10(s'/(1 − s'))`, with s' the shrunk score clamped to [0.05, 0.95]. Show it only against human
or imported opponents with real ratings. Add the median ply of the first error (from `openingsReport.firstWrongMove`)
and the average opening-phase ℓ. Apply the same Perf formula per colour and per time control (base minutes:
<3 / 3–10 / >10) as a summary row.
