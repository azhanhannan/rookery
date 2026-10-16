# Round 1: Aina (beginner, about 6 months, rated 500–700)
<!-- cadence-lint: skip (chess feature discussion, not IT maintenance) -->

## 1. First impressions of what exists

**What helps me**
- **Bots from about 400 Elo** are great. Most apps start their bots at a level that crushes me. If the 400 bot plays like a person and actually hangs pieces back (the Maia ones sound like that), I'd play it every lunch break.
- **Puzzles with hints.** I like that hints are there. I give up on puzzles when I'm stuck with no way forward.
- **My games with mini-boards and win/loss filters.** Seeing "+8" next to a game feels good. Day groups help me spot that I play badly late at night.
- **Lots of board themes and piece styles.** Honestly, picking a pretty board is half of why I open a chess app.

**What goes over my head**
- **Game Review.** I see "Inaccuracy" on move 9 and an arrow, and I don't know *why*. "Eval +1.3" means nothing to me. The eval graph looks like a stock chart. "Miss" vs "Mistake" vs "Blunder" makes me feel judged, not taught.
- **Accuracy 62%** with no context. Is that bad for my level? I can't tell.
- **"Style rating: plays like Maia 1100."** Sounds cool, but I don't know what Maia is. Is that good or bad?
- **Opening name.** "Italian Game: Giuoco Pianissimo" doesn't help me. I don't know openings.
- **Glicko-2, rating as a range.** I just want one number and an arrow going up.
- **No takebacks vs the bot.** When I hang my queen on move 6 against a bot, I just resign and close the app. That's the moment you lose me.

## 2. Feature ideas

- **Takeback vs bots (casual games only)** — MUST-HAVE. Losing my queen to a misclick on a phone is the number one reason I rage-quit. Let unrated games have undo.
- **Plain-words coach line in Review** — MUST-HAVE. Under each Mistake/Blunder, one sentence like "Your knight on f3 was left unprotected. The bishop could take it for free." No numbers.
- **"Hanging piece" warning toggle in casual games** — MUST-HAVE. A soft red glow on my piece that can be taken for free *before* I confirm the move. Most of my losses are this one thing. Off in rated games.
- **Hint button during a game vs bot** — NICE-TO-HAVE. Show which piece to move, not where it goes, so I still think.
- **Daily puzzle on the Play/home screen** — MUST-HAVE. One small puzzle with an easy streak counter gives me a reason to open the app every day.
- **"Key moments only" mode in Review** — NICE-TO-HAVE. Show me the 3 biggest swings, not all 40 moves. A full review of every move is homework.
- **Retry the mistake** — MUST-HAVE. In Review, a "Try again" button that puts me back at the position where I blundered so I can find the better move myself.
- **Friendly accuracy wording** — NICE-TO-HAVE. Replace or pair "62%" with something like "Good for your level (most 600 players get about 55%)".
- **Losing-streak cushion** — NICE-TO-HAVE. After 3 losses, suggest "Want an easier bot or a few puzzles to warm up?" instead of letting me tilt.
- **Puzzle themes in words** — NICE-TO-HAVE. Show "Fork" or "Free piece" with a 1-line explanation once I solve it, so I learn the name.
- **Simple lessons: "the 5 things beginners lose to"** — NICE-TO-HAVE (later). Forks, pins, back-rank mate, hanging pieces, Scholar's mate defence.

## 3. Cosmetics / look & feel

- **Big, clear move dots and last-move highlight** that work on a small phone screen. Thumb-sized squares matter more than texture.
- **Soft, satisfying sounds.** A wooden "tock" for moves and a distinct "snap" for captures. A *gentle* check sound, not an alarm. Maybe 2–3 sound packs (wood, soft clicky, silent with haptics).
- **Win celebration**: a short confetti or the rook doing a little hop, plus "+12" counting up. Keep it under 2 seconds and skippable.
- **Loss screen that isn't sad.** "Good fight! Your best move was 14. Nf5" with a green badge. Show one positive thing first.
- **A mascot**: a small cartoon rook (it's called Rookery!) or a crow/rook bird that pops up in Review to say the coach lines. It makes "you blundered" feel less harsh coming from a cute bird.
- **"Great move!" pop** when I play a Best/Great move during a casual game, if I turn that on.
- **Beginner-friendly default theme**: high-contrast flat green/cream with plain classic pieces. Fancy textures can be opt-in.
- **Dark mode for night games** and a reduced-motion option.

## 4. What I'd push hard for

**Plain-words explanations in Game Review, plus "Try again" on my mistakes.** The expert and trainer may say an eval bar and engine lines are "the truth", and the intermediate player may want more stats. But for me the Review screen right now is a report card I can't read. If each blunder came with one sentence a 10-year-old understands, and a button to retry the position, I'd actually *learn* from losing instead of quitting. Numbers can stay behind a "Show details" toggle for the people who want them.
