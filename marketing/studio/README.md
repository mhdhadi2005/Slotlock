# Slotlock Studio

3D character reels for Instagram (@slotlockusa), starring **Lockie**.
Everything is built from primitives in Three.js and rendered frame by frame in
headless Chromium (software WebGL), so every frame is a pure function of time.

## Render

```bash
cd marketing/studio
npm install                                   # three + ffmpeg
export NODE_PATH=$(npm root -g)               # Playwright is installed globally
node render.js ghosted --preview 2,6.6,14     # quick stills -> prev-ghosted-*.jpg
node render.js ghosted                        # full MP4 -> out/ghosted.mp4 (~4-5 min)
```

An episode is `episodes/<name>.html`: copy an existing one. It must set
`window.DUR` (seconds), `window.render(t)` and finally `window.READY = true`.
Use `captions()`, `outro()`, `env()`, `prog()`, `keys()` and `E` from `lib.js`,
characters and props from `kit.js`, and `bubbles()` / `showBubbles()` from `ui.js`.

## Style guide

- **Format:** 1080×1920, 30 fps, 17–23 s. Big caption top-left (Bricolage, key words
  in the orange gradient via `<em>`), Slotlock logo at the bottom, and the standard
  outro (logo, two-line punchline, "Booking + deposits for tattoo artists. Free for
  founding artists.", `DM "BOOK"` button) for the last ~3.3 s.
- **Camera:** `setup({ camPos: [0, 2.6, 13], look: [0, 1.95, 0] })`. At z=0 you can
  see about x = ±1.95, so keep characters within ±1.5.
- **Structure:** a hook in the first 2 s → the relatable pain → Lockie fixes it → payoff
  → outro. One joke per beat and a sound-effect word (POOF!, BONK!, CLICK!) at the peaks.
- **Truthful:** only show what Slotlock really does. Clients pick a real opening,
  send the deposit straight to the artist (Venmo, PayPal, Cash App, Zelle…),
  unpaid holds expire on their own, and the artist confirms the deposit.
  Slotlock never holds money. Email features need email switched on first.

## Cast

| Character | Builder | Personality |
|---|---|---|
| Lockie | `makeLockie()` | Orange padlock mascot. Calm, unbothered, protective. Shackle opens/closes (`open`), has `shades`. |
| The Ghost | `makeGhost()` | The no-deposit client. Overpromises, vanishes (`opacity`), sweats (`sweat`). |
| The Artist | `makeArtist()` | Tattoo artist in a green beanie with a machine. Long-suffering, easily delighted. |
| Clients | `makeBlob(color)` | Gumdrop clients. The good ones pay; the bad ones say "I'll pay later". |

Props: `makeChair`, `makeClock`, `makeSign(lines)`, `makeCoin`, `makeTumbleweed`,
`makeConfetti`, `makePoof`.

## Episode log

Add every new episode here so ideas never repeat.

| Date | File | Premise | Outro line |
|---|---|---|---|
| 2026-09-23 | ghosted | No-deposit client vanishes at 2pm; Lockie's "DEPOSIT FIRST" sign scares the ghost off | Ghost-proof your books. |
| 2026-09-23 | bouncer | Lockie bounces "I'll pay later" at the calendar's velvet rope | Hire the bouncer. |
| 2026-09-23 | flood | DM bubbles bury the artist; Lockie bursts out with one link | One link. Zero chaos. |

## Idea backlog

- "I'm 5 min away" client (a clock shows it's been 45 min)
- The Ghost tries a fake Venmo screenshot; Lockie squints and waits for it to land
- Lockie's first day on the job
- "Can I get a discount if I bring my cousin?"
- Artist opens books at midnight and Lockie handles the stampede while they sleep
- Client asks to move the appointment 6 times
- Ghost family reunion (every no-show from this year)
- "Is this still available?" asked 40 times
- Lockie vs. the cancellation 1 hour before (the deposit stays with the artist per their policy)
- Before/after: artist's DMs vs. artist's calendar
- Lockie tries a new tattoo (a tiny heart on the shackle)
- Speed-run: book, pay, confirm in 10 seconds
