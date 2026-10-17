# Round 2: SME #1, chess performance coach
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

## 1. Page shape: ledger underneath, focus on top

The **analytics ledger** is the right engine, and **yes, it should rank and pick the focus**. Points lost per game is the
quantity a coach is estimating by eye. Three layers, one source:

- **The ledger ranks.** Each candidate is a provable (phase × tag) cell. "Other" is never a candidate, because
  "fix your other" isn't a prescription. A cell is eligible only when it maps to a Rookery tool, and its 90% interval
  has to clear the player's pooled rate (the analytics rule against multiple comparisons).
- **BA's cards display it.** Agreed with BA on ≤ 3 cards, but the Review style sets the count. Learner gets **1 card**
  (the focus). Club gets the focus plus one "watch" card. Analyst gets the focus, then the full ledger table under it.
- **The focus is my addition.** The top eligible card gets *pinned* for a stretch, with a Train-this button and a
  start date. The page doesn't shuffle its top card every time a game is added. Stability is what makes a player
  act on it.

## 2. The re-test: I concede the claim, not the loop

**Analytics is right, and it hits my design harder than they said.** I pick the focus *because* it's the
player's worst cell. So it will regress toward the mean even if they train nothing, and my "6 of 20 → 2 of 18"
would credit the drills for that. That's a false claim, and I withdraw it.

Redesign, keeping it honest and still motivating within weeks:

1. **Pick from a long window** (all reviewed games on file, ≥ 20) to shrink the selection effect. Don't pick from the latest 10.
2. **Never compare against the window the focus was picked from.** After the focus starts, show only the
   *new* games, counted forward:
   "Since 3 Nov: 1 hanging piece in 140 contested moves." That's a fact with no comparison. Show the before
   rate only as context on the Analyst style.
3. **Hold the word "improving"** for the analytics Bayesian slope (≥ 40 games, interval excludes 0). Until then
   the honest line is "no clear change yet".
4. **Weekly motivation comes from process, not outcome.** "Forks lesson done, 9 of 12 fork puzzles retired,
   3 practice games with the threat arrow" all count work done, which is true and under the player's control. Coaches
   praise process for a living, because results lag behind by months.
5. **Close the focus by a rule, not a timer.** It ends when the slope test says the cell improved, or after N new
   games with the player's choice to keep or swap it. That replaces my "2–4 weeks".

Agreed with BA's "Repeat offenders" (E). A retired puzzle motif that shows up again in real games is the
most honest single-event signal we have, because it doesn't depend on a batch comparison.

## 3. Tilt: drop the diagnosis, keep the behaviour

Analytics is right that "your play gets worse after a loss" can't be separated from bad luck at n ≈ 100.
I drop it as an inference. What survives is a **behaviour fact with no causal claim**: "After a loss, you
started the next game within 2 minutes 14 of 18 times." That needs no review and no model, and the advice ("take a
break, or do one puzzle first") is sound practice whether tilt is real for this player or not. Show it at Club and Analyst
style only, as a toggle, never as a red warning, and never on Learner (juniors don't need their losing moods counted).
Same for session length: report "games after the 5th in a session" as a count, and don't claim they're worse
unless the error-rate interval clears.

## 4. The contested-moves filter misses the one thing coaches care about most

The 10–90 filter on `winBefore` **drops exactly the moves where a won game gets thrown away**: 95% → 40%
in one move has `winBefore` outside the band, so the ledger never sees it. For a 1500 player that's often the
single biggest leak. Fix: **define C on either side**, keeping a move if `winBefore` *or* `winAfter` is in
[10, 90]. That still drops moves where both stay deep in decided territory (+9 → +6), which is the analytics
intent. The same fix covers the mirror case, where a lost position swings to drawn and the player misses the save.

On the motif list: **ship as proposed**. Ignored threat and tablebase-wrong moves are the two I'd fight for.
Holding back pins, skewers and positional themes is right. Two coach additions:
- **Lost on time while better.** Analytics leaves these out of the chess metrics, which is correct, but they must
  count in the clock card. Flagging a won position is a time-management loss, and a fully measurable one.
- **Stalemate given away** while winning (tablebase or result `1/2` from a winning eval). It's provable and common below
  1000, and it leads straight to the K+Q mate drill.

## 5. Minimum samples: I move down, with two tiers

I take the **analytics thresholds** for showing a card: 30 contested moves for move rates, 8 events for
motif and conversion counts, 10 games for openings, with "early read" up to 3× those numbers. **Picking a focus
needs ≥ 20 reviewed games**, because a focus asks for weeks of the player's time and should rest on more
evidence than a card does. Below 10 reviewed games, the page shows one thing: "Review N more games" with Review all.

## 6. Revised top 5

1. **Points-lost ledger** (analytics), with C defined on either side (§4), as the engine for everything else.
2. **Pinned focus + Train this**, picked by the ledger from ≥ 20 games, with progress tracked by work done and
   the forward count (§2). Card count follows Review style (BA).
3. **Conversion and saves** (analytics' definition), with "play from the slip" against Maia and the matching endgame drill.
4. **Clock card**: rushed critical moves plus losses on time while better.
5. **Coach view** (SA's route behind `linkedStudent()`): the student's ledger and focus, the deciding positions,
   assign as homework, and the coach can override the focus.

Dropped from my top 5: the tilt signal (now an opt-in behaviour count) and the dated re-test (replaced by §2).
