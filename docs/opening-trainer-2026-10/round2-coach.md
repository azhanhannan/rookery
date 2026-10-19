# Opening trainer review, round 2: the coach replies to the learning specialist

*19 Oct 2026. Reply to `round1-learning.md`.*

## (a) Where we agree

- **Pause freezes the clock**, and paused repertoires are excluded everywhere.
- **Practice and non-due cards can't lapse** (M4).
- **"Hold"** (stage unchanged, not counted as a fail) is the grade for a mix-up with another repertoire and for a Hint.
- **No backlog number on the reminder or the button.** "Done for today" leaves ungraded Practice open.
- **"Tricky spots"** is worked out from the last 5 attempts, never from lifetime fails.
- **End every session on a correct answer**, with a gentle exit after a bad start.
- **"Why" prompts** come from the plan comments. I will write them.

Most important, we reached the same root answer independently: **one White and one Black repertoire active at a time.** My ruling as the coach is to **rest the Ruy and keep the Caro-Kann**. He needs a defence to 1.e4 every second game, so we fix the Caro by trimming it (Advance, Exchange, Classical to move 5-6, plus "anything else") and teaching its single idea, not by pausing it.

## (b) Where I disagree, or concede

| Topic | Verdict | Why |
|---|---|---|
| **Cap unit** | **Concede: graded due cards, 12**, soft at the line end | Lines range from 2 to 12 moves, so a line is a poor unit of load. My real concern was never cutting a line mid-way, and the soft boundary covers it. He *sees* lines; the system *counts* cards. |
| **Backlog order** | **Combine** | Her order is lowest stage, then most overdue. I add the **shallowest position (fewest plies)** as the next tie-break, because trunk moves come up in every game. I accept her point against bulk-rewriting dates, as long as overdue credit ships soon after the cap. |
| **Miss: −1 vs −2 stages** | **Concede to −2 as the default** (a tunable, `lapseDrop: 2`) | I wanted −1 because many misses at 750 are mix-ups, not real forgetting. But her design already grades mix-ups and hints as "hold", and adds an in-session relearn. What remains is a real forgetting, so −2 is honest. Revisit if the retention monitor reads above 90%. |
| **New-material budget** | **Her unit, my ceiling** | 6 new cards a day, soft by up to 3, *and* **at most one new line a day** by default. A second line is a deliberate "Another anyway" press. For an anxious learner, one line is easier to grasp than a number of cards. |
| **The forecast** | **Agree, with softer wording** | Build it and use it as the gate on new material. But "adds about 90 reviews" is precisely the kind of number that triggered today. Show **"Fits in your daily 12"** or **"Would make next Tuesday heavy, so tomorrow is better"** instead. Raw numbers belong in the sparkline, not the prompt. |
| **The from-memory pass in Learn** | **Agree: ungraded**, with the graded first try at the end of the session | Chess fit: the end-of-session retrieval can be **"play the line from the start against a bot"**. That is spaced retrieval and real use of the moves at once. |
| **Interleaving** | **Agree for White and Black. No conflicting same-colour repertoires at all**, not just a 2-week ban | Switching colour is a strong, low-interference cue, so mixing is good. Two answers to the same position is simply something a 750 shouldn't carry. Let him set it up only after a warning, and never mix the two in a session. |
| **Random spread of due dates** | **Agree**: ±15% seeded fuzz plus load-balancing, none on the 1-day rung | Also apply her rule to keep two conflicting cards off the same day, in case he keeps both after the warning. |
| **Breadth before depth** | **Agree, and here is the cut-off** | Learn order: the first **4 of his own moves** of every main reply, then deeper. Lines are capped at **8 of his own moves** at his rating; deeper only by choice. |

## (c) Joint build order (both signable)

**P0, this week**

1. Review cap **12 graded due cards**, soft at the line end. "Today: N" only; the backlog total appears only in the progress view, worded neutrally. Order: lowest stage, then most overdue, then shallowest ply.
2. Practice and non-due misses never lapse. A miss drops **2 stages** and gets one ungraded relearn at the end of the line.
3. **Resting** (pause) with the clock frozen. Resuming takes at most **6/day** for 7 days. A one-time offer when the backlog is over 2× the cap, suggesting the Ruy for today's data.
4. Wording: "Not yet. Here it is: Bb5" plus the plan comment as the reason. The summary leads with "N remembered". Rename Weakest to "Tricky spots" (last 5 attempts).

**P1, next**

5. A new-material budget of **6 cards and 1 line a day**, gated by a 14-day forecast and **off while reviews are over the cap**. Wording says whether it fits, not how many reviews it adds.
6. ±15% fuzz with load-balancing.
7. Overdue credit.
8. A same-colour conflict check: the "hold" grade, a context chip ("Ruy Lopez: move 3"), a deduplicated due count, and a one-time "choose one to keep active" prompt.

**P2**

9. Hint (the piece first, then the square; graded "hold").
10. The ungraded from-memory pass, with a graded end-of-session replay or "play from here".
11. Interleave White and Black.
12. Learn breadth first (first 4 of his moves), capped at 8.
13. "Why" prompts, the trim and size check (aim for 30-45 moves), short deviation branches and named trap lines.
14. The retention monitor (target 80-90%) and the 5/10/15-minute time box.
