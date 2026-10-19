# Gentler opening trainer — synthesis (19 Oct 2026)

Panel: chess coach SME + learning-science / spaced-repetition SME, two rounds (`round1-*.md`, `round2-*.md`).
Trigger: 70 moves due on one day (42 Ruy Lopez moves learned in one sitting), three conflicting 1.e4 e5 White
repertoires, Caro-Kann at a 40% miss rate. Hannan was stressed and felt weak. Goal: he keeps loving chess.

## Root causes in the code (learning SME, confirmed by coach)

- No cap on reviews or new material.
- Fixed 1/3/7/21 ladder with no spread, so a batch learned together stays together (+1, +4, +11, +32 days).
- A miss sends a card back to day 1, so a hard repertoire is always due.
- Misses on non-due cards (dragged in by a due line) and in Practice/Weakest still reschedule; clean answers don't count.
- Learn's immediate from-memory pass is graded.
- Positions shared by several repertoires count once per repertoire.

## Agreed

- **The app recommends, it never enforces.** It controls how much he reviews; what he keeps is his choice.
  Suggest about 30–45 own moves: one White opening, one defence to 1.e4, a short setup vs 1.d4, lines stopping around
  his 8th move. Coach's advice for Hannan: rest the Ruy, keep the Italian, keep the Caro-Kann but trim it to 3–4 lines
  built on one idea (bishop out before …e6).
- **Rest (pause)** freezes the clock: due dates move forward by the days rested, and a resumed repertoire eases back
  in under the daily cap. One-click.
- **Daily cap** counts graded due moves; the line in progress is always finished. The backlog total is never shown;
  instead "about N days to catch up" / "about 4 lines". The current pile spreads over about 5 days.
  Backlog order: most overdue first, then the earliest moves of the game.
- **Not a miss, stage unchanged:** a move from another same-colour repertoire (named: "That's your Italian move"),
  a Hint, a miss in Practice/Weakest, a miss on a card that wasn't due.
- **A real miss**: drops the card, and the missed move is asked again at the end of the line (ungraded).
- **New material**: at most one new line a day, blocked while reviews are behind; Learn's immediate pass is ungraded,
  and the graded try comes at the end of the session (replay, or "play from here" vs a weaker bot, ungraded).
  Before learning, a gentle forecast: "fits in your daily 12" or "tomorrow is better", never "+90 reviews".
- **Learn shows the line's idea before its moves**, ends on a plan, defaults to "let this settle".
- **Every session ends on a correct move.** "Tricky spots" uses the last 5 attempts only.
- **Kinder wording** on a miss, with the move's plan comment as the reason.
- **Conflicting repertoires**: the app spots them and asks once or twice, always offering "Keep both".
- **Spread of due dates**: ±15%, none on the 1-day step. Late recall earns credit.

## Where the two crossed over in round 2 (each conceded to the other) — lead's pick

| Point | Coach R2 | Learning R2 | Pick (tunable) |
| --- | --- | --- | --- |
| Daily cap | 12 | 15 | **12** — the gentler one while he is stressed |
| Miss drops | 2 stages | 1 stage (2 if recall < 80%) | **1 stage** + re-ask at the end of the line |
| New moves per day | 6 + one line | one line, ≤ 8 moves | **one line, ≤ 6 moves** |

## Build order (both signed)

- **P0** — cap 12 with the one-time spread of today's pile; gentler miss (1 stage, re-ask, the not-a-miss cases);
  Rest with a frozen clock; kinder wording.
- **P1** — new-material limit + forecast; date spread ±15%; credit for late recall; conflicting-repertoire prompt;
  shared positions counted once.
- **P2** — Hint; Learn changes (idea first, ungraded first pass, end-of-session try, play from here); mixing colours;
  "why" prompts and the size/trim recommendation; a recall-rate check (to tune the miss rule).
