# Round 1: Daniel (intermediate, ~1400–1600 rapid)

## 1. First impressions

I play on Lichess and Chess.com every day, so I judge everything against them. Honestly, **Game Review is better than I expected.** The labels, eval graph, accuracy and a Retry mode on my mistakes all work. The "Style rating", where it tells me which Maia level plays most like me, is something neither site gives me, and I'd actually look at it. The Maia bots matter to me too. A 1500 Stockfish bot plays perfect chess and then throws a piece away. A Maia 1500 makes the kind of mistakes my club opponents make.

What's missing compared to my daily routine:
- **No free analysis board.** After a review I want to try "what if I'd played ...Nd7 instead". Right now I can't leave the game line.
- **No opening work.** My whole improvement plan is the London and the Caro-Kann. I can't see where I go wrong in them or drill them.
- **One PGN at a time.** My history lives on two other sites, and I'm not pasting 200 games one by one.
- **No premoves.** In blitz against a bot, every recapture costs me clock time I don't have.
- Puzzles are rated-only. There's no Storm or Rush style mode, and that's what I do on my lunch break.

## 2. Feature ideas

- **Analysis board, plus a "Continue from here" button in Review** — MUST-HAVE. Testing alternatives is how I learn at my level, and the engine verdict alone doesn't stick.
- **My Repertoire / opening report on the My games screen** — MUST-HAVE. Group my games by opening (the name is already detected), show W/D/L and the average move where I first leave book or first drop eval. Something like "Caro-Kann Advance: you're −1.2 by move 12 in 7 of 9 games" would change how I study.
- **Mistake-to-puzzle loop** — MUST-HAVE. Every Mistake or Blunder from my reviewed games goes into a "My mistakes" puzzle set on the Puzzles page, with spaced repetition. My own errors are the puzzles I most need.
- **Bulk import by username** (Lichess public API; also a multi-game PGN file) — MUST-HAVE. Without it the review and opening features have nothing to work on.
- **Premoves** in Play (click or drag on the opponent's turn, shown as a coloured square; right-click cancels) — MUST-HAVE for blitz, NICE-TO-HAVE for rapid.
- **Puzzle themes plus a timed mode** (pick "forks" or "back-rank"; 3-minute survival) — NICE-TO-HAVE. Training a pattern on purpose beats a random puzzle.
- **Opening trainer for my own lines** (the bot plays my repertoire's replies and I must find the book move) — NICE-TO-HAVE. Useful, but it builds on the repertoire report.
- **Takebacks vs bot, casual games only** — NICE-TO-HAVE. Rated games must stay honest.
- **Sparring preset: "Maia one level above my rating, 10+5, rated"** as one button on Play — NICE-TO-HAVE. It cuts the setup to one click.
- **Plain-words coach explanations** — NICE-TO-HAVE. "Your knight on f6 was pinned" helps me more than seeing "+1.4" with no reason.

## 3. Cosmetics / look & feel

- **Move feedback in Review on the board itself:** a small badge icon on the destination square (?? / ?! / !), not only in the move list. Then my eyes stay on the board.
- **Sounds:** the synthesized tones are fine, but I'd want a soft "wood" pack, plus a distinct low-time tick when my clock goes under 10 seconds, and a different sound for castling and promotion. Ship it as a pack picker in Settings.
- **Animation speed setting** (none / fast / normal). 150 ms is good for blitz, but some people want 0.
- **Clock styling:** turn the clock red under 20 seconds and show tenths under 10 seconds. That's what I watch in a scramble.
- **Coordinates toggle** (inside or outside the board) and a "highlight legal moves" toggle. At 1500 I turn the dots off.
- **Right-click arrows and circles in several colours** on the Play board too, using Shift/Alt modifiers, so I can mark plans while thinking.
- **Save appearance to my account.** I set up my theme on desktop and then my phone looks different.
- **Eval graph:** let me click a point on the graph to jump to that move, and mark the blunders as dots.

## 4. What I'd push hard for

**The mistake-to-puzzle loop, fed by bulk import.** The beginner will want lessons, the expert an opening explorer, the trainer structured courses. All good. But the thing that breaks a plateau at my level is facing *my own* recurring errors again and again until I stop making them. Rookery already has the review engine, labels, Retry and a Glicko puzzle system, so this joins parts that already exist instead of building something new. No other site I use closes that loop properly, and it would be the reason I open Rookery instead of Lichess.
