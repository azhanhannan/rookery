# Round 2: analytics chair replies
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

## 1. One ranking engine behind both page shapes

Yes. I agree with the coach (one Focus) and the BA (at most 3 cards), and the points-lost ledger can rank for both. Each
candidate bucket is a tag × phase cell, plus "time trouble" and "conversion". Its score is the **shrunk points lost per
game**: `(Σℓ + k·μ_b)/(games + k)`. Rank by the **90% lower bound** of that score, not the point estimate. A big but
uncertain bucket then cannot outrank a solid one.

A bucket is **eligible** only when:
- it passes the thresholds in §5,
- it has a drill to link to (the BA's "ends in a drill" rule), and
- it is **testable**: at the player's current rate, we expect ≥ 8 events in the next 15 games (see §2).

Learner gets the top one as the Focus. Club and Analyst get the top three as cards, and the first card is the Focus. The
coach's "where games are decided" is the same data seen per game. I would use the deciding moves as the **evidence
list** under each card (the 5 positions Rahim wants), not as a second ranking.

## 2. The main dispute: a re-test that is honest and still timely

The coach is right that players need a verdict within weeks. The BA's last-20 vs prior-20 has a flaw nobody named:
**regression to the mean**. The Focus is picked *because* it was the worst bucket, so its next reading will usually
improve even with no training at all. "6 of 20 → 2 of 18" partly measures that selection effect. My design keeps the
timing and removes the lie:

1. **Pre-register at Focus start.** Freeze the baseline rate as the *shrunk* estimate (toward the player's overall
   error rate), which takes the selection inflation out. Freeze the unit too: events per 100 qualifying moves, so a short
   week does not look like improvement. Also freeze the target (baseline × 0.6) and the window: from Focus start until
   ≥ 15 new reviewed games **and** ≥ 2 weeks.
2. **Track only games played after the start.** The posterior on the new rate is Gamma(a₀ + events, b₀ + moves/100),
   with a weak prior centred on the baseline. Show **P(new rate < baseline)** after every reviewed game, as one of four
   states:
   - **Too early**: fewer than 5 new games or fewer than 150 new moves. Show the raw count only ("2 in 6 games").
   - **On track**: P ≥ 0.8.
   - **Not yet**: P < 0.8.
   - **Verdict**: only at the end of the window. "Fewer than before" needs P ≥ 0.95; otherwise the verdict is "no clear
     change yet", never "worse" unless P(higher) ≥ 0.95.
3. Checking the posterior after every game is a sequential look. That is acceptable because only the end-of-window
   verdict makes a claim, and the in-between states are labelled as progress, not results.
4. **Process measures, shown from day one:** drill tasks completed, My-mistakes cards for this motif passed at their
   7-day review, and lesson done. These are what the player controls, and they give feedback in days.
5. The coach's display survives: "allowed forks: 6 in 20 games (3.1 per 100 moves) → 2 in 18 (1.1)". It always appears
   with its state label beside it.

Worked numbers: at about 35 qualifying moves a game, 15 games give roughly 525 moves. A drop from 3 to 1 per 100 moves
is then about 16 vs 5 expected events, which is clearly detectable. A motif at 0.5 per 100 is not, so the testability
gate in §1 keeps it from becoming a Focus.

## 3. Tilt: yes, framed descriptively

I accept the coach's nudge if it states a fact about the player, not a cause. For example: "In the game right after a
loss, you gave away 0.9 points of win chance on average; in your other games, 0.5 (from 22 and 61 games)." Optional
second line: "You start your next game within 2 minutes of a loss 70% of the time."

The rules:
- Show it only when n ≥ 15 games after a loss, and only when the 90% interval of the difference excludes 0.
- Never use the word "tilt" or "because".
- Mute it under Learner style.
- The suggested action ("try a puzzle first") costs the player almost nothing, so a false positive does little harm.

## 4. The contested-move filter: the coach caught a real hole

My [10, 90] filter would have dropped the move that takes a +5 game (win chance 95) down to 40. That move is exactly
"throwing away a won game". Corrected rules:
- The **ledger** uses every non-book move.
- **Error rates** count moves with winBefore ≥ 10. Dropping only hopeless positions is enough, because a move with
  loss ≥ 20 is a real error even in a won position.
- The **[10, 90] window** remains only for *mean accuracy* comparisons, where flat-zone moves would dilute the average.

Conversion still owns the "won" story at game level, and the ledger's "won zone" cell counts the same losses at move
level. Each is checked against the other.

## 5. Thresholds (proposed settlement)

| Item | Number | From |
|---|---|---|
| Insights page unlocks | 10 reviewed games ("early read" until 20) | SA |
| A rate card | ≥ 30 qualifying moves **and** ≥ 8 events | SA |
| Focus of the week | ≥ 15 reviewed games, ≥ 8 events, testable | coach + SA |
| Conversion / saves | ≥ 8 episodes | SA |
| Opening line card | ≥ 8 games in that line | between the coach's 5 and my 10 |
| Tilt line | ≥ 15 games after a loss | coach |
| Intervals | 90% Wilson / Poisson; a comparison sentence only when the interval of the **difference** excludes 0 | replaces the SA's "95% intervals don't overlap", which is too strict |

All of these go in `INSIGHTS.*` tunables.

## 6. Data model

I have no strong preference, and the SA's per-move facts in IndexedDB are better than my per-game blob for slicing.
I'd add four things:
- `winAfter`, `inBook` and `critical` (multiPV gap ≥ `REVIEW.greatGap`) on `MoveFact`;
- an `oppThreat` flag (the opponent's last move created a threat that a rule can prove), for the coach's blunder-check
  gap;
- the conversion and save episodes, plus "game after a loss", on `GameFact`;
- a `focus` record (baseline, unit, target, start, window), which is **user state** and is synced, unlike the facts.

I agree with the SA that labels are recomputed and never stored, and that facts are rebuilt rather than migrated.

## 7. Revised top 5

1. **The points-lost ledger as the ranking engine** for the Focus and up to 3 cards, with the deciding positions as
   evidence.
2. **A pre-registered Focus re-test**: shrunk baseline, Gamma posterior, the states too early / on track / not yet /
   verdict, and process measures alongside.
3. **Conversion and saves**: episodes, Wilson intervals, human vs bot opponents, and a "play from the slip" action.
4. **Clock pressure**: the error-rate ratio in time trouble, and rushed critical moves (`critical` × time spent).
5. **Error rate per 100 moves by phase** (winBefore ≥ 10), feeding the phase cards. The opening leak becomes a card from
   the existing `openingsReport`, and the tilt line is an optional descriptive add-on.
