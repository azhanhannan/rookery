# Opening trainer after the 70-due day: round 1, learning-science view

Panel: learning science / spaced-repetition UX (this paper) + chess coach SME. Round 1, written independently.
Date: 2026-10-19.

## 0. What the code does today (the parts that caused the bad day)

I read `tunables.ts` (`OPENING_TRAINER`), `puzzles/spacedRepetition.ts` (`schedule`), `openings/repertoire.ts`
(`answerCard`, `shouldRecord`, `chooseLine`, `dueToday`), `openings/drill.ts` (`judgeMove`) and
`openings/drillStore.ts`. Seven mechanics explain most of the 70-card day. None is a bug; together they behave
like an exam.

| # | Mechanic | Where | Effect on Hannan |
|---|---|---|---|
| M1 | **No cap anywhere.** `Due now (N)` shows every due card; Learn has no budget either. | `OpeningsPage.tsx`, `chooseLine` | 42 Ruy moves learned in one sitting became 42 reviews the next morning. |
| M2 | **Lockstep scheduling.** Intervals are exact (1/3/7/21), no jitter. | `schedule` | Cards learned together stay together forever: the same 42 come back on day +1, +4, +11, +32, then every 21 days. The spike repeats. |
| M3 | **A miss resets to stage 0** (due tomorrow), whatever the stage. | `schedule` (`!solvedClean`) | A card at 21 days missed once is back to "tomorrow, then 3, then 7". Caro-Kann: 17 fails in 43 reps means it lives on the bottom rungs, so it is always due. |
| M4 | **Misses are recorded on cards that weren't due.** `shouldRecord` records a clean answer only when due, but *always* records a wrong one. | `shouldRecord` | Drilling a due line drags its non-due moves along *and* lets them be failed. The line-drag adds risk without adding credit. |
| M5 | **No credit for overdue recall.** The next interval comes from `stage` only; remembering a card 10 days late is treated the same as on time. | `schedule` | After a pause or a missed week, the trainer under-rates what he actually knows and keeps re-asking it. |
| M6 | **The from-memory pass in Learn is graded like a real review.** It runs seconds after the watch pass, and its misses go into `fails`. | `drillStore.finish` → quiz pass | That retrieval mostly tests working memory, so its result tells you little. A miss there still counts as a "fail" and sends the card to the top of Weakest. |
| M7 | **Same-colour repertoires are separate trees with separate cards.** `judgeMove` only knows siblings inside one tree. | `judgeMove`, `CardBook` keyed per repertoire | 3.Bc4 in a Ruy drill is marked "Not your repertoire move", and shared positions (1.e4, 2.Nf3) are three cards, counted three times in the "70". |

Also relevant: opening drills feed the shared trained-days streak (`recordTrainedDay`), and the Play page
reminder shows a raw due count. A big number in a reminder, plus a streak, reads as an obligation, and for an
anxious learner that turns into avoidance.

**Learning-science framing.** Spaced repetition only works if he keeps coming back. The best-tuned scheduler
does nothing for a learner who quits. With a newborn and a full-time job, his daily capacity changes a lot from
day to day. So the system has to (a) never show him a debt bigger than one sitting, (b) shrink the debt
quietly when he can't train, and (c) avoid making debt in the first place. The five-part plan covers (a) well
and (b) partly. It doesn't cover (c), and (c) is where this incident came from: one Learn session created all
70 reviews.

---

## 1. Pause a repertoire. **KEEP, plus freeze the clock**

- **Pause freezes time.** Store `pausedAt`. On resume, move every card's `due` forward by the number of days
  paused (`due += today - pausedAt`). Without this, a 3-week pause comes back as the whole repertoire due in one
  day, which repeats the incident. Memory does decay during a pause, but soft lapses (§4b) and overdue credit
  (§2c) deal with that gently. That is better than a flood.
- **Paused cards are excluded everywhere:** `dueToday`, the reminder, the header badge, the caps and the
  forecast. Practice mode still works on a paused repertoire and records nothing.
- **Make resuming gradual.** For the first 7 days after resume, that repertoire gets at most half the daily
  review cap. Cards beyond that wait (see §2b).
- Offer pausing **at the moment of overload**, not only in settings. When the backlog is more than 2× the cap,
  show one calm line: "Lots ready today. Want to pause one repertoire for a while? Nothing is lost." For today's
  data I'd suggest pausing the Caro-Kann (Black, highest miss rate) or the Ruy (newest) until the Italian feels
  easy. Which one is the coach's call.

## 2. Daily caps. **KEEP, but define the unit and handle the backlog honestly**

### 2a. What a cap counts
- **Count graded due cards, not lines and not moves played.** A line is the unit of practice; a due card is the
  unit of debt. Default: **12 due cards/day** (the plan said ~15; at ~3 graded cards per line that is about
  4–5 lines, roughly 8–10 minutes). Range in settings: 5–40.
- **The cap is soft at line boundaries.** Never stop in the middle of a line. When the count reaches the cap,
  finish the current line and then show "Done for today". It's fine if a line pushes 12 to 14.
- **Non-due moves along the line don't count against the cap** and can't be failed (fix M4, §4b). Line choice
  under the cap should prefer lines that cover the most due cards per move asked. `chooseLine` already sorts by
  `due` count. Add `due / userMoves` as the tie-break.
- **New-card cap: 6/day**, counted in new cards, not lines. If the next line has 4 new moves and the budget has
  3 left, allow it (soft), but don't start a line that would go over by more than 3.

### 2b. Spreading the existing 70 (and any future backlog)
Don't rewrite due dates in bulk. That's dishonest and it breaks the forecast. Use **priority + cap**:
- Today's queue = the top 12 due cards by priority, worst first:
  1. lowest `stage` (youngest memories decay fastest),
  2. most overdue relative to their interval (`(today - due) / interval`),
  3. paused repertoires excluded; Black and White interleaved (§6d).
- The rest stays due. With overdue credit (§2c), waiting a few extra days costs little.
- **Show a clear-by date, not the number.** "About 4 days to catch up at this pace (done by Thu)." Work it out
  from backlog / (cap − expected daily inflow). Never show "70 due" on the reminder or the button. Show
  "Today: 12" and put the full number in the progress view, phrased neutrally ("Waiting: 58").
- **Debt-growth guard.** If expected inflow (the 7-day forecast, §6a) is above the cap for 7 days running, the
  backlog will never clear. Then the **new-card budget automatically drops to 0** and the page says so once, in
  plain words: "No new moves until the reviews are under control. That keeps the load small." This stops a cap
  from hiding a debt that keeps growing (see backfires).

### 2c. Overdue credit (fix M5)
On a clean answer, base the next interval on the **interval he actually survived**, not only `stage`:
`elapsed = today − lastReviewed` (add a `last` field; for old records, work it out as
`due − intervals[stage−1]`). The new stage is the highest `s` with `intervals[s−1] ≤ elapsed × 1.0`, but never
lower than `stage + 1`. Example: a stage-1 card (scheduled 3 days) remembered after 10 days jumps to stage 3
(the 7-day rung) and next comes due at 21. This is what makes the cap safe: waiting doesn't punish him, it often
rewards him. It's FSRS's main insight, in a form that fits the fixed ladder.

### 2d. Fuzz (fix M2)
Add ±15% jitter to every interval of 3 days or more (3 → 3; 7 → 6–8; 21 → 18–24). Round to whole days and seed
it from the card key, so the result is the same on every device. This alone breaks up the 42-card clump within
two cycles. Also use **load-balanced fuzz**: within the jitter window, pick the day with the fewest cards
already due (Anki 23.10's "load balancer"). That costs almost nothing and does the most to stop the spike
coming back.

## 3. Name the other repertoire's move. **KEEP, with a precise grade and a cue before the move**

- Extend `judgeMove`: check the positions in other repertoires *of the same colour* by EPD. A hit is the verdict
  `'other-repertoire'` with that repertoire's name. Wording: "That's your Italian move (Bc4). In the Ruy Lopez
  you play Bb5." Then he plays Bb5.
- **Grade: hold, not miss, not pass.** Stage unchanged, `fails` unchanged, due again in
  `intervals[max(0, stage−1)]` days. He did recall *a* correct repertoire move. He just mixed up which
  repertoire he was in, and a lapse reset is the wrong signal for that.
- **Name the interference before the move, not only after.** When a line reaches a position whose EPD has a
  *different* move in another same-colour repertoire, show a small context chip: "Ruy Lopez: move 3". Learning
  science (cue-dependent retrieval and proactive interference) says recall improves when the context cue comes
  at retrieval time. Telling him afterwards that he picked the wrong one is the costlier way to learn.
- **Scheduling across conflicts.** Don't schedule two conflicting cards (same EPD, different move, both his
  colour) on the same day if you can avoid it. Load-balanced fuzz can push one of the pair a day. Bunching them
  just maximises interference.
- **Root cause.** Three White repertoires that share 1.e4 e5 2.Nf3 Nc6 and then differ is a learning-design
  problem, not just a UI one. Each shared position is also counted three times in the due count (M7). Short
  term: dedupe the count (an EPD due in two repertoires counts once in `dueToday`). Longer term: the coach
  should decide whether he keeps one 3rd move for now. From a memory point of view, learning two competing
  answers to the same cue at ~750 is the hardest possible setup. Learning one, then the other months later, is
  much easier.

## 4. Kinder wording, Hint, positive summary. **KEEP, and fix the grading under it**

### 4a. Wording
- "Not yet. Here it is: Bb5." Good. Also drop "Not your repertoire move" everywhere. After the correct replay:
  "Got it. We'll see this one again soon." That says what happens next, so it doesn't land as a verdict.
- Summary leads with what went right. Prefer **"9 remembered, 2 to revisit"** over "9 of 11 right first time".
  Don't show percentages or red, and don't bring up past fail counts mid-session.
- Rename "Weakest" to **"Tricky spots"**, and work it out from the **last 5 attempts**, not lifetime
  `fails/reps`. Otherwise a card he has since mastered stays labelled weak forever. Lifetime 17/43 is exactly
  the kind of number that makes him feel weak.

### 4b. Lapses (fix M3, M4). This matters more than the wording
- **Soft lapse:** a miss sets `stage = max(0, stage − 2)` instead of 0. Stage 4 (21 days) drops to stage 2 (due
  in 3 days), not to tomorrow. Young cards (stage ≤ 1) still go to 1 day. This matches the FSRS/Anki evidence
  that a lapse on a mature card leaves a lot of memory behind.
- **In-session relearning step:** a missed card is asked once more **at the end of the current line**. Replay
  the line from the move before the miss, or just the position. That second, successful retrieval is what turns
  a miss into learning. Only the first answer is graded. The relearn is ungraded and just feels like a second
  go.
- **Non-due cards along a line can't lapse.** If he misses a move that wasn't due, show it, and make it due
  tomorrow *without* changing its stage (`due = min(due, today+1)`). The line-drag then gives free extra
  retrieval practice and never extra punishment.

### 4c. Hint
- The piece highlight is a **partial cue** (he still has to find the square), so it keeps useful difficulty.
  Keep it.
- **Grade: hold** (same as §3): stage unchanged, due in `intervals[max(0, stage−1)]`, `fails` unchanged, and it
  counts as "remembered with a hint" in the summary.
- **Abuse:** this is a personal app, so don't police hints. One guard: if the same card gets a hint 3 times in a
  row, offer to re-teach it ("Want to watch this one again?") and move it into the next Learn session as a
  re-shown card. Don't show hint counts, and don't give badges for "no hints".

## 5. Learn one line per session. **CHANGE to a new-card budget with a forecast, and space the second pass**

- **The budget unit is new cards (6/day), not lines.** Lines vary from 2 to 12 new moves. One deep Ruy line could
  be 10. Keep "Another, or let this settle?" after each line, but say what it costs: "Another line adds 4 moves:
  about 9 reviews over the next week."
- **Change the second pass.** The immediate show → from-memory pass mostly tests working memory, so it's weak
  evidence. Better:
  1. Watch pass (as now).
  2. From-memory pass **ungraded** and right away, as a "try it": misses here never count toward `fails`
     (fix M6).
  3. **Graded first retrieval at the end of the session.** After the line, or after the next due line if there
     is one, replay the new line once from memory. That's a gap of 3–10 minutes, which is real spacing. Only
     this pass records the answer and sets stage 1 / due tomorrow.

  Same total time, much better retention evidence, and no fail stats from the learning phase.
- **Learn is gated by load.** Learn is off (soft, with an override) when today's due cards aren't done or the
  7-day forecast is above the cap. Wording: "Reviews first today. New moves stick better on a light day."
- **Breadth before depth.** For a ~750 player, the first Learn sessions in a new repertoire should cover the
  first 4–6 user moves of each main reply before going deep in one line. Order Learn lines by **depth band**,
  not just tree order. The coach should confirm the depth cut-off.

---

## 6. What's missing

### 6a. Load forecast (build this, it addresses the root cause)
A pure function `forecast(cards, days=14, pRecall=0.85)` simulates the ladder (with fuzz). It returns expected
reviews per day. Use it in three places:
- **Before Learn:** "Learning these 42 moves adds about 90 reviews over the next 7 days (42 of them tomorrow)."
  Arithmetic on the current ladder: each new card costs a review on day +1 and day +4, plus lapses at ~15%,
  which is about 2.2 reviews per card in week 1 and ~4.6 in the first month. Steady state is only about N/21
  per day (≈4/day for his ~85 distinct cards). **The load problem is bunching, not volume.** Showing him that
  is reassuring in itself.
- **On the progress view:** a 14-day sparkline of upcoming reviews, with the cap as a horizontal line.
- **As a guard:** it drives the new-card budget (§2b).

### 6b. Time box as an alternative to a count
Some days a newborn allows 4 minutes. Offer **"Quick 5 / 10 / 15 minutes"** next to the count cap. It stops at
the end of the line after the time runs out. The cap is whichever comes first. Also say clearly: "Stop
any time. Every move you've answered is saved." The code already records each answer as it happens, so this is
true.

### 6c. Streak and reminder pressure
- Opening drills count for the trained-days streak. Keep that, since it gives him credit. But **a trained day
  should never need opening reviews to be finished.** One line is enough.
- The Play page reminder: no counts above the cap, never red, and phrased as an invitation ("Your Italian has a
  few moves ready, about 6 minutes"). "Not today" should silence it **until tomorrow**, not just hide it.
- No badges for clearing a backlog. They make the backlog a goal.

### 6d. Interleaving
Mix White and Black lines within a session (Ruy line → Caro line → Italian line) instead of one repertoire
start to finish. Interleaving helps discrimination and long-term retention, and it means the 3.Bc4/3.Bb5 cue
gets practised as a cue instead of being rote. One exception: **don't interleave two conflicting same-colour
repertoires in the first two weeks after learning one of them.** Get it stable first, then mix.

### 6e. Retrieval with meaning
Rote move recall at 750 is fragile. Where the PGN has a plan comment (`step.plan`), ask a one-tap "why" every
few lines ("Why Bb5?" with two choices: "pressure on the knight defending e5" or "prepare castling"). It isn't
graded for scheduling. Elaborative retrieval makes the move stick, and it makes the trainer about chess, which
is the point. The coach should write these.

### 6f. Wellbeing exits
If he misses 3 or more of the first 5 graded answers in a session, gently offer to switch: "Tough start. Want to
switch to a line you know well, or call it a day?" Then end on a success, a "known-good" line from a mature
card. **Always end a session on a correct answer.** The peak-end effect governs how he'll remember the session.

---

## 7. Things that could backfire

| Risk | Mitigation |
|---|---|
| A cap hides a growing debt that one day bursts | Debt-growth guard (§2b): new cards auto-stop and a clear-by date is shown. Overdue credit (§2c) means a backlog shrinks itself. |
| Soft lapses + overdue credit + hold grades make the scheduler too lenient, so recall falls | Track **true retention**: share of graded due cards remembered first time, rolling 30 days. If it drops below 80%, shorten the top rung (21 → 14). Keep this in a dev/tunables view, not in front of him. |
| Hint becomes the default | Re-teach offer after 3 hints in a row (§4c). Hints still slow the ladder, so overusing them costs reviews, quietly. |
| Pause becomes permanent avoidance | A reminder once, 14 days after pausing: "Your Caro-Kann is resting. Want a gentle 3-move warm-up?" Never more than that. |
| "Done for today" feels like being locked out | Practice mode stays open after the cap, ungraded: "Extra practice. Doesn't change your schedule." |
| A clear-by date turns into a deadline | Give it as a range and move it automatically. Never "overdue". |
| Kind wording makes misses feel meaningless | Wording is gentle but the effect is visible: "We'll see this again in 3 days." Being honest about the schedule counts as kindness too. |
| Fuzz/load balancing confuses "why is this due today?" | Hover note "Spread out to keep days even". It's rarely needed. |

---

## 8. What I'd build first (priority order)

**P0, this week (stops a repeat):**
1. **Review cap 12 + "Done for today"**, soft at line end, counting graded due cards only. Reminder and button
   show today's number, not the backlog. (§2a, §6c)
2. **Non-due cards in a line can't lapse** and **soft lapse (stage − 2)**. These are small changes to
   `shouldRecord`/`schedule` and they remove most of the "unfair" feeling. (§4b)
3. **Pause with clock freeze.** (§1)
4. **Wording pass:** "Not yet. Here it is", summary leads with remembered count, "Tricky spots" from the last 5
   attempts. (§4a)

**P1, next (stops the debt forming):**
5. **Forecast + new-card budget 6/day gated by load**, and the forecast line before Learn. (§6a, §5, §2b)
6. **Fuzz + load-balanced fuzz**, and a one-time re-spread of the current Ruy clump using it on their next
   successful review. (§2d)
7. **Overdue credit.** (§2c)
8. **Other-repertoire verdict (hold grade) + context chip + deduped due count.** (§3)

**P2, makes it better than Anki:**
9. Hint (hold grade), the Learn second pass moved to the end of the session, interleaving, time box, "why"
   prompts, wellbeing exit, retention monitor.

**For today's data specifically:** with P0 in place, Hannan sees "Today: 12 · about 5 days to catch up" and can
pause one repertoire with a single click. The Ruy cards answered late get overdue credit once P1.7 lands, so
waiting costs him nothing. The coach should rule on how many same-colour repertoires a 750 player should
maintain at once. My learning-science answer is **one White, one Black repertoire active at a time**, with any
second White repertoire paused until the first is mostly at the 7-day rung or above.
