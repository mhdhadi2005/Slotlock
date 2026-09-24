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
- **Beauty palette:** `setup({ palette: "blush" })`, `<html data-look="blush">` and the blush
  `<style>` block at the top of `episodes/squeeze.html` (pink background, Fraunces captions, pink outro).
- **Camera:** `setup({ camPos: [0, 2.6, 13], look: [0, 1.95, 0] })`. At z=0 you can
  see about x = ±1.95, so keep characters within ±1.5.
- **Structure:** a hook in the first 2 s → the relatable pain → Lockie fixes it → payoff
  → outro. One joke per beat and a sound-effect word (POOF!, BONK!, CLICK!) at the peaks.
- **Truthful:** only show what Slotlock really does. Clients pick a real opening,
  send the deposit straight to the artist (Venmo, PayPal, Cash App, Zelle…),
  unpaid holds expire on their own, and the artist confirms the deposit.
  Slotlock never holds money. Email features need email switched on first.
  Also real now: consult-first services (client sends idea + photos, artist
  quotes, client books the quote), books open/closed with a waitlist and a
  "books are open" email, digital consent forms signed on the client's phone,
  and automatic aftercare instructions after the appointment.
  New audience: beauty pros (nails, lashes & brows, hair). Their pages come in
  pink (Blush) or nude (Latte), with add-ons (e.g. "+ nail art") and a
  patch-test rule. Point beauty episodes at slotlock.app/beauty and use a
  softer palette (pink #e0457f, blush backgrounds) where it fits.

## Cast

| Character | Builder | Personality |
|---|---|---|
| Lockie | `makeLockie()` | Orange padlock mascot. Calm, unbothered, protective. Shackle opens/closes (`open`), has `shades`. |
| The Ghost | `makeGhost()` | The no-deposit client. Overpromises, vanishes (`opacity`), sweats (`sweat`). |
| The Artist | `makeArtist()` | Tattoo artist in a green beanie with a machine. Long-suffering, easily delighted. |
| Clients | `makeBlob(color)` | Gumdrop clients. The good ones pay; the bad ones say "I'll pay later". |
| Pink Lockie | `makeLockie({ color: 0xff7aa8, feet: 0xe0457f, key: 0x7a1d45 })` | Beauty episodes. Same Lockie, blush edition. Has `cukes` for spa day. |
| The Nail Tech | `makeTech()` | Hair bun, pink smock. Frazzled by squeeze-in DMs; `sweat`, spa extras `mask` (0-1) and `cukes`. |

Props: `makeNailTable` (polish, UV lamp, wrist cushion), `makeMagnifier`, `makeHourglass` (`at(k)` drains it),
`makeBell`, `makeJar(label)` (`fill(n)` stacks coins), `makeFlipSign(front, back)`, `makeChair`, `makeClock`, `makeSign(lines)`, `makeCoin`, `makeTumbleweed`,
`makeConfetti`, `makePoof`.

## Episode log

Add every new episode here so ideas never repeat.

| Date | File | Premise | Outro line |
|---|---|---|---|
| 2026-09-23 | ghosted | No-deposit client vanishes at 2pm; Lockie's "DEPOSIT FIRST" sign scares the ghost off | Ghost-proof your books. |
| 2026-09-23 | bouncer | Lockie bounces "I'll pay later" at the calendar's velvet rope | Hire the bouncer. |
| 2026-09-23 | flood | DM bubbles bury the artist; Lockie bursts out with one link | One link. Zero chaos. |
| 2026-09-24 | screenshot | The Ghost "pays" with a fake Venmo screenshot; Lockie's magnifier, the artist's real $0.00, the hold's hourglass runs out | Nice try, ghost. |
| 2026-09-24 | tower | "Just a gel mani" grows a tower of add-on polish bottles that crashes; pink Lockie shows add-ons are picked, priced and timed at booking | Extras? Already booked. |
| 2026-09-24 | midnight | Books open at midnight; Lockie rings a bell and the waitlist books in single file, deposits into the artist's jar, while the artist sleeps | Books open. Chaos closed. |
| 2026-09-24 | squeeze | Nail tech at 7pm buried in "can u squeeze me in??"; pink Lockie shows the next real opening, client books, tech goes spa mode | Squeeze-ins? Not anymore. |

## Idea backlog

- Beauty: the lash client who skipped the patch test; Lockie holds up "48 HOURS" and hands over a patch test booking

- Consult-first: a client sends a blurry "like this but different" photo; Lockie hands over the idea form and a quote comes back
- Paper consent forms flying everywhere vs. one tap to sign on the phone
- Aftercare: Lockie as a tiny nurse reminding the client "no pool for 2 weeks"

- "I'm 5 min away" client (a clock shows it's been 45 min)
- Lockie's first day on the job
- "Can I get a discount if I bring my cousin?"
- Client asks to move the appointment 6 times
- Ghost family reunion (every no-show from this year)
- "Is this still available?" asked 40 times
- Lockie vs. the cancellation 1 hour before (the deposit stays with the artist per their policy)
- Before/after: artist's DMs vs. artist's calendar
- Lockie tries a new tattoo (a tiny heart on the shackle)
- Speed-run: book, pay, confirm in 10 seconds
