# Player profile — round 2, product / system analyst (18 Oct 2026)
<!-- cadence-lint: skip (chess feature discussion) -->

I agree with the coach on *what* to ship (habits and strengths, verbs not nouns, Focus is the only action), and
with analytics on *how to show it* (intervals, clear / leaning / not enough, Maia in the player's own positions as
the only "typical" baseline). I drop my phase 2 "style counters" as a separate step and fold them into analytics'
forcing share. One disagreement with the coach, on bots (§2).

## 1. Second line: analytics is right, my estimate was wrong

Checked: `REVIEW.multiPV = 2` (`src/config/tunables.ts:43`), `reviewRunner.ts:69` asks the engine for it, and
`classify.ts:47` reads `lines[1]` for Great moves. Then `toPosition()` (`src/review/buildReview.ts:18-20`) keeps
only `lines[0]`. Storing it means adding `second?: { move; score }` to `PositionReview`, filling it in
`toPosition()`, setting `MoveFact.critical` in `facts.ts`, and bumping `factsVersion`. **Revised: ~0.5 day, no
engine time** (was 2–3 days). Only reviews run after the change have it, so **land it before Hannan's depth-16
re-review**. Otherwise he has to re-run everything a second time. That order is the one firm sequencing call in
this round.

## 2. Bot-only reality

The coach gates every trait on human opponents. Hannan mostly plays bots, so under that rule he would see
nothing for months. My rule splits by what the trait measures:

- **Habits** (threat checking, hanging pieces, phase leak, converting and saving, clock): every opponent counts,
  with the existing opponent filter. A piece you left hanging is still your move against a bot. When over half the
  games are against bots, the section header says "Mostly from games against bots (24 of 30)". Conversion is
  already split human vs bot in `EpisodeCard`. Keep that split.
- **Style** (forcing share, simplification, "plays like ~X", aggression vs Maia): **human opponents only**.
  Weakened Stockfish bots blunder on a dice roll, so the positions they give you are not a human game. For
  Hannan this shows "Not enough games against people yet (3 of 40)" and nothing more.

## 3. Gates on my table

| Reviewed qualifying games | Shows |
| --- | --- |
| 0 | Locked, plus the re-review offer |
| 10 | Insights early read only; the profile section shows "n of 20" |
| 20–39 | **Profile opens (coach's gate).** Habits plus at most 2 strengths, each through its own card gate (8 episodes, 30 moves / 8 events). Opening breadth at 20 per colour |
| 40+ per speed, humans | **Style traits (analytics' gate)**, each clear / leaning / not enough |
| 100 | Trends; enough games for the split-half reliability check (≥ 60) that replaces analytics' guessed ρ₁ |

## 4. Revised plan (estimates, agent-assisted, unmeasured)

0. **Store the second line**, ~0.5 day. Then run the re-review, then fix clock capture on the account that recorded
   0 of 14 games with clocks (timing traits are dead without it). Diagnosing that is unestimated.
1. **Habits & strengths profile** in a "Your recent games" section on `#/insights`, built from what Insights already
   has. Coach's template: dated window, verb phrasing ("you converted 7 of 9"), strengths through the same gate as
   weaknesses, a Focus-matching habit reads "This is your Focus", and the closing line "This describes recent
   games, not you". Clear / leaning / not-enough states. Coach tab reuse. **~1.5 days.**
2. **Forcing share + cost by type** (factsVersion bump, chess.js and `findSacrifice`, human-only, 40 games). Cost
   by type feeds the ledger, not a new action. **~1.5–2 days.**
3. **Pooled "plays like ~X"** from existing `maiaMatch` curves, marked uncalibrated. Plus a background batch
   so it isn't one button per game. **~1–2 days**, heavy on CPU.
4. **Aggression vs Maia, pressure created, simplification.** ~2–3 days. After Phase 4 calibration for anything
   comparative.
5. Never: archetypes, "positional" from `other`, multiPV ≥ 3 risk appetite by default.

## 5. My open questions, answered (recommendations; Hannan decides)

1. **Labels: no, permanently.** Descriptors only. The coach's identity argument, plus analytics' point that one
   label hides several traits and flips, settles it for me. Calibration makes comparisons honest. It doesn't make
   nouns safe.
2. **Public profile: nothing.** Coaches see it through the link check. Revisit an opt-in strengths-only line only
   if someone asks for it.
3. **MultiPV 2 cost:** moot. It is already paid.
4. **Learner and style:** none. Learner sees at most 2 proven strengths plus the Focus sentence, as the coach
   proposed. Style traits are Analyst only and Club shows a one-line summary.
