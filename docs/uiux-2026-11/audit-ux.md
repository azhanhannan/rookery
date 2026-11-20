# Rookery UX audit (November 2026)

Scope: per-page critique of the live site (https://rookery.runcodecloud.com), signed out, using the
design-critique framework (first impression, usability, hierarchy, consistency, accessibility).
Viewports: mobile 375x812, tablet 768x1024, desktop 1440x900; dark and light colour schemes.
I played 1.e4 Nf6 2.d4 e5 against Bot 800 (Rated, Unlimited), resigned, and opened the review of that game.
Signed-in-only screens (Insights with data, Coach, My games, profile) were **judged from code**
(`src/app/InsightsPage.tsx`, `CoachPage.tsx`, `AccountNav.tsx`, `EndScreen.tsx`), not seen live.
No source files were changed. Screenshots are described inline rather than saved.

The lead's observations were confirmed (13-button Play panel, New game below the fold on phones, blank
"Loading X..." screens, small Openings empty-state card next to a large empty board, 11 nav items with no
grouping, flat dark pill buttons everywhere). The mascot is not missing: it is a contextual element that only
shows in the Insights gate, the end screen after a reviewed game, Practice-coach warnings, captions and the
coach walkthrough, and it is switched off by the "Coach mascot" setting. It never appears on Play, which is
the start page.

---

## Top 10, ranked by user impact

| # | Page | What is wrong | Why it matters | Suggestion | Effort |
|---|---|---|---|---|---|
| 1 | Play (all sizes) | One teal fill is used for **primary action, selected toggle, status banner and badge** at once. The end screen has four teal blocks stacked: "Black wins by resignation" banner, "Review this game", "Play again at 600", "New game". In the New-game dialog Engine, 800, White, Unlimited, Rated **and** Start are all the same teal. | When everything is emphasised nothing is. After a game the user cannot see the one next step; in the dialog the Start button does not stand out from the choices. | Reserve the solid accent for one primary action per view. Selected segments: tinted background plus a 1px ring or a check, not the full fill. Result banner: plain heading text, not a button-shaped block. | M |
| 2 | Play | Side panel is a flat list of about 13 equal buttons mixing game actions (New game, Resign), board settings (Flip, Sound, Eval bar, Full screen), help (Keyboard shortcuts), a second game mode (Spar vs Maia) and export (Copy/Download/Import PGN). The move list grows above them, so the buttons jump down after every move. | The two buttons that matter in a game (Resign/Offer, New game) are hard to find, and the layout shifts under the cursor. | Three tiers: (a) game bar under the board (New game, Resign, Flip); (b) a fixed-height scrolling move list; (c) a "..." or "Game" menu for PGN copy/download/import, sound, eval bar, shortcuts. Move Spar into the New-game dialog as an opponent option. | M |
| 3 | Header (phone, signed out) | **Settings is unreachable on phones when signed out.** `AccountNav.tsx` renders Settings with `hidden sm:inline`, and the More menu does not list it. The only paths are the "change" link on Insights and the explorer's token link. | Board colours, pieces, sound, premoves, review style and the Lichess token are all on that page. A phone user cannot find them. | Add Settings (and Sign up) to the bottom of the More menu, or show a gear icon on phones. | S |
| 4 | Puzzles (mobile) | Under the board come Full screen, Keyboard shortcuts (no use on a touch phone), the mode tabs, streak, a calculate checkbox and the rating. Only then the task line ("Your turn: find the best move for White"). On desktop "Next puzzle" is the teal primary while the puzzle is unsolved; Hint and Show solution are grey. | The instruction for the puzzle is off-screen on a phone, and on every size the strongest button means "skip". | Put the side-to-move prompt directly under the board (or in the player bar). Make the visual weight follow the state: before solving, no primary (or Hint); after solving, Next puzzle becomes primary. Hide Keyboard shortcuts on touch devices. | S |
| 5 | Review | Wrong order of information. On desktop the panel shows style tabs, Coach walkthrough (small grey button), opening name, toolbar buttons, an Opening explorer error box, the move list, and only then the accuracy summary, which is below the fold. The explorer shows "needs a Lichess token" expanded by default for every user without a token. Both players get all 10 move-class rows even when they are all 0. | The answer users came for (how did I play, where did it go wrong) is buried under tools and an error. The coach walkthrough, the strongest feature, looks like a secondary button. | Order: result + accuracy + key moments, then **Coach walkthrough as the primary action**, then the move list, then tools. Collapse the explorer by default when there is no token, with one line instead of an error. Show only non-zero move classes, with an "all" toggle. | M |
| 6 | Review copy | After a 2-move resignation the summary says "100.0 accuracy, Typical for ~2500", and the end screen offers "Suggested next: Bot 600" (a level down). "Estimate from playing style" is a live button under text saying it needs at least 10 moves. The depth picker uses "depth 12 / 16 / 20". | Claims the data cannot support undermine trust in the rest of the review, which is otherwise carefully proven. | Set a minimum-moves floor (as Game rating already does: "Not enough moves to estimate") for accuracy and the "Typical for" line; do not suggest a lower bot after an early resignation; disable the estimate button below the threshold; label depths by time ("about 10 s / 30 s / 1 min"), depth as a sub-label. | S |
| 7 | All routes | **Scroll position is not reset on route change.** No `scrollTo` anywhere in `src/`. Measured: scrollY 500 on Review, then navigated to #/play on a phone and landed mid-panel with the board and header off-screen. Lazy routes also show only a small "Loading X..." line for a moment. | On phones you arrive on a page part-way down, with the header gone. Users think the page is broken. | Scroll to top on hash change (keep scroll for back/forward if you want). Replace the text fallbacks with a skeleton the same shape as the page (board square + panel), which also stops the layout jump. | S |
| 8 | Openings (empty) | On desktop a small "Build your first repertoire" card sits top-right next to a full-size static start-position board. On phones the card is below the dead board. The library list does not change the board when you hover or pick an entry. Header "Openings" vs page title "Opening trainer". Section label "AS BLACK AGAINST 1.E4" is uppercased by CSS, which turns SAN into "1.E4" / "1.D4". | The page's purpose is to choose a repertoire; the board takes the space and shows nothing useful. "E4" is not chess notation. | When there is no repertoire, open the library by default and use the board to preview the selected line (play through it). Rename to one label everywhere. Drop `uppercase` on headings that contain moves (or write "Against 1.e4" in sentence case). | M |
| 9 | Navigation | 11 items, 3 shown plus More, no grouping; About (a licences page) is both a nav item and a footer link. Current page is shown only by text colour (`text-ink` vs `text-muted`), and hover uses the same colour, so a hovered link looks exactly like the current page. | Users cannot build a model of the app (play / review / train / tools), and they can lose track of where they are. | Group the More menu: **Train** (Puzzles, Openings, Endgames, Drills, Lessons), **Study** (Analysis, Insights, Import), then Settings / About. Take About out of the menu (footer only). Mark the current page with weight or an underline that hover does not copy. | S |
| 10 | Import | At 375 px the Lichess username field is squeezed to about 50 px ("Liche..."). Paste-PGN comes first though "From Lichess" is the more common route; the PGN placeholder is full sample text that reads like real content. There is no Chess.com option, and the copy does not say whether imported games are saved when signed out. | Import feeds Insights (needs 10 to 20 reviewed games). Friction here blocks the whole training loop. | Stack the Lichess row on phones (username full width, then two selects). Put "From Lichess" first. Use a one-line placeholder ("Paste PGN here"). Say where the games go: "Saved on this device; sign in to keep them everywhere". | S |

---

## Per-page findings

### Play (`#/play`)
- **First impression:** board left, controls right on desktop. Good: the board is the hero and stays square
  at 1440x900. Bad: the start state is a hot-seat game ("Player 2 / Player 1", "Resign (White)") and the
  dialog defaults to **Friend, same screen**. For a personal training app, Bot is the likely choice.
  Default to the last-used opponent, or to Bot.
- New-game dialog: on an 800 px tall window it scrolls; Start and Game type (Rated/Practice) are below the
  fold. "Rated" is the default for a signed-out user, with a small caption "Sign in to get a rating". Default
  signed-out users to Practice, or explain in one line what Rated means for them.
- Selected vs hover in the level grid look very alike (a ring on hover, fill when selected; 3000 "looked"
  selected while hovered).
- "Eval bar on" / "Sound on" are toggles whose label is the current state, styled like actions. Use a switch
  or "Eval bar: on". The eval bar also shows in a **Rated** game, which goes against the roadmap rule
  "no helpers in rated games". Check whether that is intended.
- Resign uses an inline two-step confirm ("Confirm: resign", red). That works. Keep it.
- End screen: good copy ("Good fight. Every loss has a lesson in it"), a clear Review CTA, and a sign-in nudge
  in small text. Too many teal blocks (see Top 1). After resigning the board keeps the eval bar with no
  label for what +0.9 means.
- Mobile: board, then the whole panel; New game is about 1.5 screens down. A sticky bottom game bar
  (New game / Resign / Flip / menu) would fix it.
- Tablet (768): a single column, so the controls are below a board that fills the width. A two-column layout
  could start at 768 with a slightly smaller board.

### Review (`#/review`, `#/review/<id>`)
- "Review this game" opens a depth picker first (Fast/Normal/Deep) with no board. That is one extra step.
  Start at Normal automatically and offer "Deeper" afterwards (the page already has "Re-run" and "Analyse
  deeper here").
- Progress state "Analyzing move 1 of 4" with a percentage and Cancel works. It shows on an empty page with
  no board, so the user waits without context. Show the board and fill the eval graph as analysis comes in.
- Learner / Club / Analyst tabs at the top have no explanation here (the explanation is on Settings). Add a
  tooltip or a one-line caption.
- Toolbar: "Show best line", "Retry mistakes" (disabled with no reason given), "Analyse from here", "Analyse
  deeper here", arrow chips. Four similar "analyse" verbs. Merge them into one "Analyse" menu.
- Phone: the eval bar turns horizontal and the graph sits under the nav buttons. That works, but the game title
  and result only appear after the graph. Put "You vs Bot 800 · Black won by resignation" above the board.
- `#/review` with no id opens the most recent game rather than a list; the list is behind a small "Other
  games" text link. Fine for a habit loop, but "Other games" should look like navigation (for example
  "All games ›" next to the title).

### Puzzles (`#/puzzles`)
- Mode tabs (Rated / My mistakes / Daily / Timed) look good as a segmented control.
- "1500?" with a bare question mark for a provisional rating. Write "1500 (provisional)" or give the ? a
  tooltip.
- The streak says "Trained today" before any puzzle was solved in this visit (my bot game counted). Fine if
  intended. Say what counts ("a game, puzzle or drill").
- Theme select at the bottom changes the next puzzle. Move it next to the mode tabs so it is chosen first.
- Calculate mode ("pieces hide after 5 s") is a bare checkbox between the streak and the rating. It belongs
  with the theme as a puzzle option.

### Insights (`#/insights`)
- Signed out with 1 local game: the mascot gate ("Review 10 more games and I'll show you...") is the best
  empty state in the app: clear threshold, mascot voice, two actions. Issues: there are two thresholds (10 for
  the gate, 20 for "Your recent games" and for a focus), which is confusing. "Left out: 1 fewer than 10 of your
  moves" is hard to read (try "1 game left out: under 10 moves"). The two links have different weights
  (bold "Import games", normal "Review one game") with no clear reason.
- From code: Analyst style stacks about 8 same-style panels (bucket cards, ledger table, phase rates, clock,
  conversion/saves, openings, after-loss) with no in-page navigation. Add a sticky section index or
  collapse sections, and lead with the Focus card. Learner style shows little beyond the focus. Good for
  beginners, but there is no hint that more exists.
- Filters (Speed, Opponents) are bare selects. Fine. Add "Reset" when filtered.

### Analysis (`#/analysis`)
- Good: multi-PV lines with depth, clear FEN/PGN tools, "Play this position vs bot".
- The page title "Analysis board" is under the board on phones but at the top on other pages (Insights,
  Endgames, Lessons, Import). Pick one rule: the title above the board, or in the header, on every page.
- "Stockfish on" is a teal-filled toggle (same accent problem).
- Opening explorer error again expanded by default (see Review).
- The tools list (Load FEN, Start position, Empty board, Edit position, Import/Copy/Download PGN, Save as
  repertoire, Play vs bot) is another flat button run. Group it under "Position" and "Export".

### Openings (`#/openings`)
- See Top 8. The library copy is very good: short, specific, levelled (Beginner / Club / Advanced).
- The "Close" link on the library card is the only exit and is accent-coloured like a primary link.

### Endgames (`#/endgames`)
- A clear list grouped by theme (Basic mates, King and pawn, Rook endgames). The "Win" badge is teal, the
  "Draw" badge grey. Teal reads as "done/success", so it looks as if the Win drills are already passed. Use
  neutral badges for the goal and keep the accent for a completed state (if progress is tracked, show it:
  check mark, best result).
- No mini-board per drill. A small position thumbnail (MiniBoard already exists) would help people recognise
  drills such as "Lucena" and "Philidor".
- The intro mentions "tablebase (perfect play, up to 7 pieces)", which is jargon for Learner-level users.

### Drills (`#/drills`)
- Good: a self-contained game with a big Start, side choice, and best scores.
- The board here is desaturated with rounded corners, unlike every other board. That is deliberate (no
  coordinates), but the different look makes it seem disabled. Use the user's normal board theme.
- Only one drill exists, yet the nav label is plural "Drills" and the title is "Name that square!". Either
  call it "Square drill" or make Drills a hub.

### Lessons (`#/lessons`)
- The strongest learning page: progress bar "0/7 done", numbered list, step pager with Back/Next, an arrow on
  the board, plain language.
- A lesson does not change the URL (it stays `#/lessons`), so the browser Back button leaves the section and a
  lesson cannot be linked or resumed. Use `#/lessons/<slug>`.
- The lesson list has no "3 to try" progress per lesson, only the total.

### Import (`#/import`)
- See Top 10. "I played: White / Black / Neither / not sure" is helpful. The default "Neither / not sure" is
  the teal-selected one, so it looks like the recommended answer.

### About (`#/about`)
- This is a licences and credits page and says nothing about what Rookery is. Fine as a footer link; it should
  not be a main nav entry. Consider a short "What Rookery does" section at the top for new visitors.

### Settings (`#/account` signed out; also judged from `AccountPage.tsx`)
- Live preview board at the top. Good. Colour and texture swatches are labelled and the selected one has a
  ring (this is the correct selected-state pattern; use it in dialogs too).
- Very long single page (Board, Pieces, Play, Ratings, Moves, Game Review, Coach mascot, Lichess token...)
  with no section index. On phones the preview board scrolls away as soon as you reach Pieces. Add a small
  sticky section nav, and keep the preview sticky on desktop.
- Hidden from signed-out phone users (Top 3).

### Coach (`#/coach`; signed-in views judged from code)
- Signed out: a centred title, one line, and a "Log in" text link. It does not say what coaching gives you
  (comments per move, homework, a shared Insights tab). Add two or three lines and a Sign up option.
- Signed in: routes for student, game comments and homework; loading is a bare "Loading..." and errors are a
  red line of text with no retry. Add retry and a back link on errors.

---

## Cross-page patterns

1. **One accent for everything.** Primary buttons, selected segments, toggles in the "on" state, result
   banners, "Win" badges and links all use the same teal. Define three roles: *primary action* (solid
   accent, one per view), *selected* (tinted surface plus ring or check, like the Settings swatches),
   *status* (text or a small dot, not a button shape).
2. **Flat button runs instead of grouped controls.** Play, Review, Analysis and Settings each list 6 to 13
   same-size grey pills. Group by job (play / board / export) and move rare actions into a menu.
3. **Page frame differs by page.** Insights, Endgames, Lessons, Import, About and Settings have a title at
   the top; Play, Puzzles, Openings and Drills start with the board; Analysis puts the title under the board.
   Pick one rule and apply it everywhere, for example a small page title row above the board on board
   pages.
4. **States are uneven.** Empty states range from very good (Insights gate with mascot, Lessons) to thin
   (Coach signed out, Openings). Loading states are a single grey line; errors are red text without retry.
   Write one empty / loading / error pattern (mascot line + one primary action; skeleton; message + Retry)
   and use it everywhere.
5. **Phone ordering puts the task below tools.** On Play, Puzzles and Openings the most important line or
   button sits under several utility buttons. Rule: on a phone, under the board comes the task (whose move,
   what to find), then the primary action, then tools.
6. **Desktop-only affordances on touch.** Keyboard-shortcut buttons appear on phones (Play, Puzzles,
   Review). Hide them on `(pointer: coarse)`.
7. **Labels drift.** Openings / Opening trainer, Drills / Name that square!, Review / "Other games",
   "Analyse from here / Analyse deeper here / Re-run". Keep one name per thing.
8. **Copy is a real strength.** Plain, specific, human sentences (library blurbs, lesson steps, the end-screen
   line, Insights' "This describes your recent games, not you"). Keep this voice and remove the few
   statistics that over-claim on tiny samples (Top 6).
9. **Light and dark both work.** Light mode switches correctly from `prefers-color-scheme`, with a warm paper
   background (#f4f1ea) and dark ink. The teal accent becomes a deep green that reads well in both. No palette
   change needed; the problem is how often the accent is used, not the colour.
10. **The mascot is underused, not missing.** It appears only after a game has been reviewed, in Insights and
    in coach moments. One placement on first visit (Play empty state: "Pick a bot and I'll review the game
    with you") would introduce it where new users start, without adding decoration.

### Things deliberately not recommended
Accent-stripe cards, gradient heroes, emoji headers, a uniform card grid, a purple/indigo palette, or copying
the Chess.com/Lichess look. The current warm-neutral palette with a green accent is distinctive enough; the
work is in hierarchy and grouping.
