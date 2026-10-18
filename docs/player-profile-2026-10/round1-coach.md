# Player profile — round 1, coach's chair

*Coach SME (FIDE Trainer, 600–2200 students).*

## Are player "types" real?

Partly, and mostly above the level Rookery's users play at. Kotov's and Hellsten's style categories
(attacker, positional, defender, universal) describe *preferences* that strong players have already earned:
they can play every kind of position and choose some. Below ~1800, what separates players is not style but
**error habits**: pieces left hanging, the opponent's threat not checked, a won ending not converted, the clock burnt
in move 12. Dvoretsky's method was never "find the student's type"; it was "find what keeps recurring in their
games and train that". A coach does use a profile — but it is a profile of *habits and strengths*, not personality.

**Horoscopes (do not ship):** attacker / positional / tactician labels from one metric (captures per game,
"sharpness", accuracy); "coffeehouse"; "you play like Tal"; animal/archetype cards; any label from accuracy.
At 1200 the "attacker" is usually someone whose opponents hang pieces. These labels feel good, say nothing
testable, and change no training.

**Real and useful (behaviours a coach would act on):** where points leak by phase; threat-blindness ("hope
chess", Heisman); conversion vs saving; how the clock is used; how the opening is approached; how play changes
after being worse. Every one of these is already in `GameFacts` or one field away.

## The identity risk

A label is a sentence the student repeats to themselves. "I'm an attacker" becomes the reason not to study
endings; "I'm bad at endgames" becomes the reason to trade nothing. Juniors and beginners are the most exposed
(fixed vs growth mindset). Rules I'd insist on:

1. **Verbs, not nouns.** "In your last 24 games you *converted* 7 of 9 winning positions", never "You are a converter".
2. **Dated and windowed.** Every line says which games it came from; the profile is recomputed, and says so: "This
   describes recent games, not you."
3. **Lead with a proven strength.** Motivation matters, but the strength must pass the same evidence gate as a
   weakness. No filler praise ("you're creative!").
4. **Learner style:** strengths only (max 2) plus the Focus. Habits that are weaknesses appear only through the Focus.

## Relation to Focus

Focus answers *what to fix now*; the profile answers *how you tend to play* — context for the Focus, never a second
to-do list. No profile card gets its own "Train this" if that would compete with the Focus; instead a habit that
matches the Focus says "This is your Focus", and others say "Watch" (Club) or are just shown (Analyst). One action
at a time is a coaching principle, not a UI preference.

## Proposed traits

All: human opponents only (bots distort style), split by speed, ≥ 20 reviewed games for the page section,
same 90% interval / shrinkage rules as Insights. Comparisons are **within the player** (your endgame vs your
middlegame) or absolute counts — no rating-band comparisons until Phase 4 calibration.

| Trait (phrasing) | Evidence in games | Minimum | Advice / link |
| --- | --- | --- | --- |
| **Where your games are decided** — "Most of the points you lose go in the middlegame" | ledger by phase | existing ledger gates; interval of the difference between phases excludes 0 | phase target: calculation mode / endgame drills / opening trainer |
| **Checking their threats** — "In N games you missed the opponent's threat X times per 100 moves" | `oppThreat` + ignored-threat/hanging/allowed-mate | 30 moves, 8 events | My mistakes (ignored-threat), Learner lesson on "what does my opponent want?" |
| **Finishing won games** / **saving worse ones** — strength or habit | `conversion`, `save` episodes | 8 episodes each | endgame drills (convert); Maia sparring from a saved winning position |
| **Clock use** — "You spend 30% of your time in the first 10 moves" / "lose on time while better" | `spentMs`, `timeTrouble`, `lostOnTimeWhileBetter` | ≥ 15 games with clocks | no drill exists: advice text + timed puzzles; never the Focus by ledger (as decided) |
| **Opening approach** — "You leave known theory around move 5; results after that are no worse" (prepared vs improviser) | `bookPlies`, ECO spread, loss in O after book | 10 games per row (as decided) | opening trainer only if the opening phase actually leaks; otherwise say "your openings are not the problem" — that sentence saves juniors hundreds of wasted hours |
| **Play when worse** — fights or folds | after-loss line + loss rate after win chance < 30% | after-loss rules as decided | Maia sparring from a worse position (defence practice) |
| **Style rating by phase** (Analyst only, later) — "Your endgame moves look like a lower-rated player's than your middlegame moves" | Maia fit per phase | ≥ 150 non-forced moves per phase; interval of difference excludes 0; label "uncalibrated" until Phase 4 | the weaker phase's drills |

The one "aggressive vs solid" axis I would allow is purely descriptive and Analyst-only: draw rate and share of
games decided before move 30, with no virtue attached and no training link. I can live without it.

## Phrasing template

> **From your last 24 rated games (rapid, humans):**
> You **finish won games** well: 7 of 9 converted. ✔ strength
> You **miss the opponent's threat** about 3 times per 100 moves — this is your Focus.
> Your openings are not where you lose points.
> *This describes recent games, not you. It updates as you play.*

Three lines, one strength, one action, one reassurance — that is what I'd say in a lesson.

## Bottom line

Ship a **habits & strengths profile**, not a personality type: 4–6 dated, verb-phrased traits built from the
existing facts, gated like Insights, with the Focus as the only action. Hold the Maia phase comparison until
calibration, and do not ship attacker/positional labels at all.
