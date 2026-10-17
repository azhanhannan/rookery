# Round 1 — SME #1: chess performance coach (FIDE Trainer view)
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

I've diagnosed club players from a stack of 30–50 of their games for years. The stack shows you the
problem. What the player needs from you is **one diagnosis, one prescription and a re-test date**,
not a dashboard. Rookery already has the prescriptions: My-mistakes SRS, opening trainer, 12 endgame
drills, 7 lessons (free pieces, forks, pins, skewers, back rank, Scholar's, discovered attacks),
calculation mode, square drill and coach homework. So Insights should be the **router** that sends a
player to the right one of those. It shouldn't become a second Review.

## What actually costs points, by level

| Level | The leak (in order) | Software can detect it? |
|---|---|---|
| **~600 (Aina)** | 1. Pieces left hanging, and free pieces not taken. 2. Missed mate-in-1/2 both ways. 3. Early queen raids and Scholar's-type traps. 4. Not converting a won game (stalemates, no K+Q mate). | **Yes, almost all.** `captions.ts` already proves hanging pieces, missed mates, forks and free pieces. Losses at this level come from a few loud blunders, so counting them is enough. |
| **~1500 (Daniel)** | 1. One tactical blunder per game, often on the *opponent's* threat (no blunder check). 2. Time management: too fast in critical positions, then time trouble. 3. Throwing away won positions (+3 → draw or loss). 4. One opening line that keeps going wrong. 5. Not knowing basic rook endings. | **Mostly.** Win-chance swings, `clockMs` per move, `openingsReport` and endgame-phase eval swings are all measurable. The *reason* behind a fast move (panic? didn't see it?) needs a human. |
| **~2250 (Farid)** | 1. Conversion and technique in better positions. 2. Time spent badly: deep thinks on routine moves. 3. Specific opening structures. 4. Defending worse positions (gives up too early or collapses). 5. Prophylaxis and quiet-move misses. | **Partly.** Phase splits and clock data help. Strategic misjudgement and "wrong plan" can't be proved by rule, so software should point at the games and leave the verdict to the player or a coach. |

What a coach does by hand: sort the losses, find **the move where the game was decided** (the biggest
win-chance drop) and put each one in a bucket: tactic missed/allowed, time, opening, endgame
technique, conversion, or "unknown". Then count the buckets. Rookery can do the first 80% of that
automatically. The "unknown" bucket goes to the coach link.

## Insight features (Insight → why → Rookery action)

1. **"Where your games are decided"** (deciding moment bucketed by phase and type, over the last 20–30 reviewed games). *Why:* it's the coach's core diagnosis, and it tells you where to put the next hour. *Action:* a deep link to the matching tool. "Allowed a fork" goes to the Forks lesson and a filtered My-mistakes set. "Endgame" goes to the endgame drill that fits the material.
2. **Blunder-check gap: "their threat, not your move"** (the share of decisive errors where the opponent's previous move created a threat that a rule can prove). *Why:* this is the habit gap at 800–1600. Knowledge isn't the problem; checking is. *Action:* Practice games with the threat-arrow helper *on*, then a "rated without helpers" re-test, plus the lesson "The two-second check".
3. **Time profile** (time per move by phase, time left at the decisive error, the share of losses with <10% of the clock left, fast moves (<3s) in positions where win chance swung by more than 15%). *Why:* time is the most under-diagnosed leak in club chess and it's fully measurable from `clockMs`. *Action:* calculation mode for the "too fast in critical positions" profile, and a suggestion to play a longer time control for a week for the time-trouble profile.
4. **Conversion rate** (games reaching ≥ +3 / win chance ≥ 85% → percentage won, and the move where it slipped). *Why:* the cheapest rating points there are. *Action:* "Play this position" against Maia from the slip point, plus K+Q / K+R mate and Lucena/Philidor drills when the slip was in the endgame.
5. **Opening leak** (already half-built in `openingsReport`): the one line with a median first error before move 12 *and* ≥ 5 games. *Action:* the opening trainer on exactly that line.
6. **Recurring motif** (the same proven caption type ≥ 3 times in the window). *Action:* the matching lesson, then homework-style themed My-mistakes.

## Behavioural signals (report gently, only with enough data)

- **Tilt:** results and blunder rate in the game *after* a loss versus the baseline, and how often the next game started within 2 minutes of a loss. This is real and measurable. The action is a nudge, not a lecture: "After a loss your next game goes worse. Try a puzzle first." This fits the existing loss-streak cushion.
- **Playing fast when winning:** move time drops and blunder rate rises when ahead. That's the classic relaxation error, and it feeds the conversion insight.
- **Resignation timing:** resigning in positions the engine calls ≤ −2 but still holdable, or worse, losing on time in won positions. Show this to 1800+ players only. For a beginner, "never resign" is the advice anyway.
- **Session length:** the 6th+ game of a session versus games 1–3. Point out the late-night blitz drift.

## Harmful or useless insights

- **Vanity accuracy % trends.** Accuracy depends on the opponent and the type of position. Its trend over time teaches nothing and invites gaming the number. Show win-chance-based facts instead.
- **Small samples.** Nothing under ~15 reviewed games, and no "trend" from 5 games. Every insight shows its *n* ("7 of 22 games"). Below the threshold, the insight says "not enough games yet".
- **40 findings at once.** A 600 player gets **one focus**, a 1500 player one focus plus one "watch", an analyst can expand everything. The default follows Review style (Learner/Club/Analyst).
- **Unprovable "you lack strategic understanding"** sentences. Same rule as captions: a rule proves it, or it isn't said.
- **Comparisons with other players' percentiles.** They demotivate juniors and don't lead to any action.

## Presentation: a weekly focus cycle

One **Focus of the week**, chosen from the biggest bucket with enough *n*, linked to 2–3 concrete
tasks that already exist (lesson, drill set, My-mistakes filter). It's tracked in the weekly training
log and **re-tested** after 2–4 weeks on new games ("allowed forks: 6 of 20 → 2 of 18"). That
before/after is the only motivating number in Insights. The player can pin a focus or swap it, but
gets only one at a time.

## The coach's use (Rahim via `#/coach`)

A coach wants the **bucket counts and the decisive-moment positions** for a student, not their
accuracy. Coach view: the student's focus, the 5 deciding positions behind it (each one click to
comment), "assign as homework" straight from an insight, and an override ("the real problem is
calculation, not openings"). The coach writes the "unknown" bucket by hand. That's where a human is
worth paying.

## My top 5

1. **"Where your games are decided"**: deciding-moment buckets with *n*, each linking to a Rookery tool.
2. **Focus of the week + re-test**: one focus, existing tools as tasks, a before/after on new games.
3. **Time profile** from `clockMs`: fast-in-critical-positions and time-trouble losses.
4. **Conversion rate**, with "play from the slip" against Maia and the matching endgame drill.
5. **Coach view of insights**: deciding positions, assign as homework, coach override of the focus.

Honourable mention: **tilt/after-loss signal**, delivered as a gentle nudge alongside the existing loss-streak cushion.
