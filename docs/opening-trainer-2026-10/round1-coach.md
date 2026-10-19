# Opening trainer review, round 1: the chess coach's view

*Panel: chess coach (this paper) and learning-science / spaced-repetition UX specialist. Written independently, 19 Oct 2026.*

## 0. The coaching diagnosis first

Before the five parts, here is what I would tell Hannan if he were my student and walked in with this data.

**You did nothing wrong. You were given too much to carry.** At about 750 rapid, very few games are decided by the opening. They are decided by hung pieces, missed forks and undefended f7/f2. Openings matter at this level in three ways only:

1. Get the pieces out, castle, and don't lose material in the first 10 moves.
2. Know the two or three traps that really happen at this level, from both sides: Fried Liver, Légal, Blackburne-Shilling 3...Nd4, early queen raids on f7.
3. Reach a middlegame whose **plan** you understand.

Move-order memory is worth something only after those three.

His load today:

| Repertoire | Colour | Lines | His moves | Note |
|---|---|---|---|---|
| My first time | White | 2 | 6 | 1.e4 e5, overlaps the others |
| Italian | White | 3 | 13 | 3.Bc4 |
| Ruy Lopez | White | 7 | 42 | 3.Bb5, **all learned in one sitting on 18 Oct** |
| Caro-Kann | Black | 5 | 26 | 17 fails in 43 reps (40% miss rate) |
| **Total** | | 17 | **87** | three White repertoires that disagree at move 3 |

For a 750 player I would aim for **about 30-45 drilled moves in total**:

- one White opening of about 15-20 moves;
- one defence to 1.e4 of about 12-18 moves;
- a simple setup against 1.d4 or everything else, about 5-8 moves.

Main lines should stop at **move 6-8 of his own moves**. Side lines should be 2-4 moves deep and end on a plan, not on a move. He is carrying about twice that amount, and a third of it (the Ruy) went in on one day. The 70-due wall was the predictable result. It says nothing about his ability. **The app should say so out loud.**

**The Ruy Lopez is the wrong main opening for him right now.** This is no criticism of the opening. The Ruy's value lies in slow manoeuvring (c3, h3, Nbd2-f1-g3, the d4 break), and those ideas mean little until about 1400-1600. The Italian teaches what a 750 needs: development, the f7 pressure point, open tactics, and the traps he will actually meet. My advice is to **keep the Italian as his White, merge "My first time" into it, and pause the Ruy** (not delete it) as "for later". If he *loves* the Ruy, then pause the Italian instead. What matters is that **one White opening is active**. The trainer should present this as a choice, not a verdict.

**The Caro-Kann is a good choice; the shape is the problem.** A 40% miss rate across 5 lines usually means the lines look alike and the move orders differ slightly (Advance ...Bf5/...e6/...c5 vs Classical ...dxe4 ...Bf5 vs Exchange ...Nc6/...Bf5). The fix is to teach the **one idea that unites them**: "get the light-squared bishop out *before* ...e6, then ...e6, ...Nd7, ...Ngf6, and break with ...c5". Then trim to:

- the Advance;
- the Exchange;
- the Classical to move 5-6;
- a one-move "anything else: ...d5 and develop" plan.

Read in code: `src/config/tunables.ts` (`OPENING_TRAINER`), `src/openings/drill.ts`, `repertoire.ts`, `drillStore.ts`, `src/puzzles/spacedRepetition.ts` (`schedule`), and `OpeningsPage.tsx`. Several of my points below come straight from what the code does today.

## 1. Pause a repertoire: KEEP, with one essential condition

This is the most important part of the plan, because it is how he sheds the Ruy without losing it.

- **Pausing must freeze the schedule.** On resume, shift every card's `due` forward by the paused days, or re-spread them over the next 5-7 days. If due dates are left untouched, resuming the Ruy in three weeks drops all 42 cards on him at once. That is today's avalanche again, made by the very feature meant to prevent it. **This is the biggest backfire risk in the plan.**
- A paused repertoire must not count in any total, badge or "due" number anywhere in the app.
- Use the label "Resting", not "Paused": "Ruy Lopez is resting. Your progress is kept." Resting is something a strong player does deliberately.
- Resuming should feed the cards back gradually. Treat them as reviews under the daily cap (part 2), oldest stage first.

## 2. Daily caps: KEEP, but change the unit and manage the backlog

The numbers are about right:

- **15 reviews.** A line holds about 3-6 of his moves, so 15 reviews is roughly 3-4 lines, or 6-10 minutes. That suits an adult with a newborn.
- **6 new moves** is about one short line a day, which is correct.

Changes:

- **Cap by whole lines, not raw moves.** Stopping a line halfway feels like being cut off and leaves a half-learned sequence. Rule: once the cap is reached, finish the current line and stop. The "6 new" cap means "one new line (up to about 8 moves)". For a long line, teach the first half today and the rest tomorrow, splitting only at a natural point such as after castling.
- **Handle today's 70 once.** When caps ship, re-spread the existing overdue cards over about 5 days. Without that, a cap of 15 with a backlog of 70 shows "55 still waiting" for a week, which is the same stress in slow motion. **Never show the backlog total on the main screen.** Show "Today: 15" and "Done for today".
- **When over the cap, review the earliest moves first.** Positions at moves 1-4 come up in nearly every game; move 9 of a side line almost never does. A coach always protects the trunk before the leaves.
- **No new lines while behind.** If reviews are over the cap, hide or soften "Learn new lines": "Let's settle what you have first." That rule alone would have prevented the 18 Oct Ruy session.
- Add a ±1-2 day spread at stages 7 and 21. The 42 Ruy cards will otherwise keep returning as one block forever. The ladder has no randomisation today; my colleague will have more to say on this.

## 3. A move from another same-colour repertoire: KEEP, but it is a band-aid for the real fix

Naming it ("That's your Italian move; this line is the Ruy Lopez: Bb5") and not counting it as a miss is right. He *knew* a correct move, and calling it wrong is what felt unfair.

The root problem, which this part does not fix:

- **Two active repertoires that answer the same position differently are a coaching error.** Over the board there is one position and one move. The trainer should detect the conflict (same EPD, same colour, different user moves, both active) and say so once, calmly: "Your Italian and Ruy Lopez disagree at move 3. Most players keep one active. Which would you like to play now? The other can rest." Offer [Keep Italian] [Keep Ruy] [Keep both for now]. Warn at the moment a conflicting repertoire is created, too.
- **Shared trunk cards.** Cards are keyed per repertoire (`cards[repId][epd]`), so 1.e4 and 2.Nf3 are three separate cards across his three White repertoires. Three reviews of a move he cannot forget is padding in the due count. Positions with the same answer across active same-colour repertoires should count and be drilled once.
- **Track mix-ups quietly.** Don't hide them entirely. Keep a private "mix-up" count, and after about 3 mix-ups at the same position, use that as the prompt for the choose-one conversation above. Hiding the confusion forever would just keep it alive.
- Today `judgeMove` treats only the parent node's **siblings** as "other-line". Cross-repertoire checking and transpositions within a repertoire (same EPD reached in a different line) should use the same kinder path.

## 4. Kinder wording, Hint, summary: KEEP, with three changes

- **Wording.** "Not yet — here it is" is fine. For an adult, though, the best kindness is a **reason**, not softness: "Your line plays Bb5 here — pinning the knight that defends e5." The tree already stores PGN comments as `plan` (`DrillStep.plan`), so show the plan on a miss whenever there is one. Gentle wording that turns sugary will feel patronising and fail just as badly.
- **Hint highlights the piece: good.** That is how I hint students too ("which piece wants to move?"). Make the second press show the square. **A hinted card should not move up a stage**: repeat it at the same stage, sooner. If it costs nothing it becomes a crutch; if it counts as a full miss nobody will press it. The plan's "returns sooner but isn't a miss" is right as long as it does not also advance.
- **The real harshness is in the code, not the words.**
  - `schedule()` sends a missed card back to **stage 0** (due tomorrow), whatever its stage. Forgetting one move after 21 days does not mean he never knew it. **Drop one stage** (21→7, 7→3) instead of resetting. This one change will shrink tomorrow's pile more than any wording.
  - `shouldRecord()` records a wrong answer **in every mode**, so a slip in *Practice* or *Weakest* reschedules the card for tomorrow. Practice is meant to be a safe place to experiment. Misses in Practice and Weakest should not touch the schedule.
- **The summary.** Leading with what went right is correct. Keep it truthful ("11 of 14 from memory. Bb5 and O-O to look at tomorrow") and never add a red score or a percentage on a bad day.

## 5. Learn one line per session: KEEP, and teach the idea before the moves

One line, then "Another, or let this settle?" is exactly how I teach. Additions:

- **Idea first.** Before the watch-and-play pass, show one sentence: "Italian, Giuoco Pianissimo: develop quietly with c3 and d3, castle, then aim for d4 when ready." Then play the moves. A move order hung on an idea survives; a bare move order is gone within a week, and his Caro-Kann numbers show that.
- **End each line on a plan, not a move.** The last screen should say what to do next: "Now: Re1, Nbd2-f1-g3, h3." If the line has no plan comment, prompt him to write one in his own words. Students remember what they write themselves.
- **Then play it.** After learning a line, offer "Play from here against a bot" (the app already has bots and Spar). Five minutes of using the position fixes it better than five more reps.
- **Make "let this settle" the default button.** It should not feel like quitting.

## 6. What's missing, in priority order

1. **A repertoire-size check written in a coach's voice.** "You're carrying 87 moves across 4 openings. Around 40 is plenty at your level. Want help choosing what to rest?" Offer resting, never deleting. Show it once and let him dismiss it.
2. **Opponent deviations, the 750 reality.** Below 1200, opponents leave book by move 2-4. Each opening needs short "if they play something odd" branches covering the common sidelines: vs the Italian, 2...d6, 2...Nf6, 3...Nf6 and 3...Nd4; vs the Caro, 2.Nc3/3.Nf3 and the Fantasy 3.f3. Each branch should be 1-3 moves ending on a principle ("develop, castle, take the centre"), not a long line. These are worth more than another Ruy sub-line.
3. **Traps as memorable lines.** "Don't fall for the Fried Liver" and "Punish 3...Nd4" are lines a 750 will meet *this month*. Give them story names. Named, dramatic lines are the easiest to remember and the most motivating to drill.
4. **Link to his own games.** `fromGames` already reads his openings. Show "This position came up in 6 of your last 20 games" next to a line, and drill the lines that come up first. If a line never appears in his games, suggest resting it. Seeing his own games come up in drills makes the trainer feel useful, not like homework.
5. **A depth guide at creation.** When a line passes his 8th move at his rating, say gently: "Deep enough for now. Most of your games leave book before here."

## 7. What I would build first

1. **Today's relief.** Re-spread the existing overdue cards, add daily caps by whole line with no backlog number shown, and make a miss drop one stage instead of resetting to 0. Practice misses stop touching the schedule.
2. **Resting (pause) with the schedule frozen.** Then the one-time choose-one prompt for the Italian/Ruy conflict, plus naming the move from the other repertoire (part 3).
3. **Plan comments on misses and at line ends**, plus a Hint that does not advance the card.
4. **Learn: one line, idea first, "let this settle" as the default, "play from here".**
5. **Shared trunk cards, the size check, deviation branches, game-frequency priority.**

## 8. What could backfire

- **Pause without a frozen schedule**: an avalanche on resume. Freeze it, or don't ship pause.
- **Caps that leave a visible backlog**: a permanent guilt counter. Re-spread the backlog and hide the total.
- **Hiding every mix-up forever**: the Italian/Ruy confusion never resolves. Count them quietly and raise the choice once.
- **Sugary wording**: feels patronising to an adult. Give reasons, not reassurance.
- **A Hint that costs nothing**: becomes a crutch. **A Hint that counts as a miss**: never gets used.
- **The trainer deciding for him** ("delete the Ruy"): it is *his* hobby. Recommend, explain, and let him choose; resting is always reversible.

The measure of success is not cards reviewed. **It's whether he opens the trainer tomorrow without dread, and whether his games start with pieces out and king castled.** At 750, ten calm minutes a day of a small repertoire plus puzzles will gain more rating than any amount of Ruy Lopez theory, and he will keep loving the game.
