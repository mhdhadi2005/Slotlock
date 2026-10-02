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
`makeBell`, `makeJar(label)` (`fill(n)` stacks coins), `makeFlipSign(front, back)`, `makePartyHat`, `makeCake`
(`candles`), `makeBanner(texts)` (`show(i)`), `makePhone(screens)` (`show(i)`), `makeSnail`, `makeMedal`, `makeLabel(lines)`, `makeHeart`, `makeCup`, `makeChair`, `makeClock`, `makeSign(lines)`, `makeCoin`, `makeTumbleweed`,
`makeConfetti`, `makePoof`.

## Episode log

Add every new episode here so ideas never repeat.

| Date | File | Premise | Outro line |
|---|---|---|---|
| 2026-09-23 | ghosted | No-deposit client vanishes at 2pm; Lockie's "DEPOSIT FIRST" sign scares the ghost off | Ghost-proof your books. |
| 2026-09-23 | bouncer | Lockie bounces "I'll pay later" at the calendar's velvet rope | Hire the bouncer. |
| 2026-09-23 | flood | DM bubbles bury the artist; Lockie bursts out with one link | One link. Zero chaos. |
| 2026-10-02 | didyouget | Deposit sent, then "did u get it?" ×6 in 4 minutes; Lockie's "I SENT IT" button, the artist gets the email and confirms in one tap, the client gets "You're booked" | "Did you get it?" Yes. Booked. |
| 2026-10-02 | bridaltrial | Bride's checklist: dress ✓ cake ✓ venue ✓ nails ✗; pink Lockie says book both now, trial (Sep 12) and wedding day (Oct 3), two deposits | Trial booked. Big day booked. |
| 2026-10-02 | dogportrait | Pet portrait of Biscuit the dog, then 200 reference photos bury the artist; Lockie's consult form takes up to 4 refs, quote, deposit; Biscuit approves the tattoo | 4 photos. 1 very good boy. |
| 2026-10-02 | clipboard | Lash lift client gets 6 pages of paper forms and her pen dies; rewind, she signs the consent form on her phone when booking and walks in on time | No clipboard. Start on time. |
| 2026-10-02 | sickday | Artist sick (thermometer, scarf) with 4 clients tomorrow; Lockie: cancel in the dashboard with a note, each client gets an email and rebooks next week; soup | Sick day? Four clicks, not four DMs. |
| 2026-10-01 | mompays | Tough guy wants a giant skull, "my mom's paying"; mom squints at the phone, Lockie points her to the deposit, she sends it and gives Lockie a cookie | Anyone can pay. Everyone pays first. |
| 2026-10-01 | pricepls | DMs full of "pp?" ×47; the tech types the price list again; pink Lockie puts prices on the page, clients book with deposits; next "pp?" gets "link in bio" | "pp?" Link in bio. |
| 2026-10-01 | facetime | Consult day with the group chat on FaceTime ("BIGGER", "add a wolf", "make it pink"); Lockie's IDEA + REFS FIRST, consult form, quote, deposit; one rose, group chat approved | One idea. Not twelve opinions. |
| 2026-10-01 | instabrows | "I want THESE brows" from a filtered selfie; magnifier reveals FILTER: GLAM 3000; pink Lockie's consult with a no-filter photo, quote, deposit; real fluffy brows | No filter. Real booking. |
| 2026-10-01 | flashday | Flash day line around the block; Lockie puts flash slots on the page, everyone books a time with a deposit and leaves, the 12:00 client stays | Flash day. No line. |
| 2026-09-30 | paymethods | "Can I pay the deposit with… him? 🐐", then an IOU and a meme coin; Lockie shows the artist's Venmo / Cash App / Zelle, they pay, the artist confirms, the goat stays | Deposits: yes. Goats: no. |
| 2026-09-30 | christmas | December DMs: "open on christmas??" ×20; pink Lockie in a Santa hat blocks Dec 25, clients book the 23rd and 24th, then cocoa in the snow | Block the day. Keep the holiday. |
| 2026-09-30 | nightowl | 11:47 PM, a night owl wants 2 AM; the yawning artist's page only shows 11 AM–7 PM, they book Sat 6 PM and show up in shades | Your hours. Not 2 AM. |
| 2026-09-30 | sleepylash | "I won't fall asleep this time" → asleep instantly, lashes grow over 2 hours; wakes obsessed and books the fill before leaving | Book the fill before they leave. |
| 2026-09-30 | splitsession | Client wants a back piece in twelve 30-min lunch-break chunks; the dragon poster cracks into 12 tiles, Lockie snaps it back with BACK PIECE · 6 HRS, they book the full day | One back piece. One real session. |
| 2026-09-29 | holdexpire | "Hold Saturday? I get paid Friday"; the hold's hourglass runs out while Jay goes shopping, the slot reopens and the next client books with a deposit | Holds expire. Deposits don't. |
| 2026-09-29 | forgot | 2 PM lash fill, nobody shows ("omg i totally forgot"); REWIND, pink Lockie's day-before reminder email, the client arrives right on time | They forget. Slotlock doesn't. |
| 2026-09-29 | influencer | "Free tattoo for a shoutout? I have 900 followers"; bouncer Lockie's EXPOSURE ≠ DEPOSIT, they pay, then post about it anyway | Exposure's cute. Deposits pay rent. |
| 2026-09-29 | oldprices | Client waves a 2019 price screenshot ("full set is $25 right?"); pink Lockie shows today's prices and stamps it OUTDATED; they book at $65 with a deposit | Prices from 2019? Not on your page. |
| 2026-09-29 | aftercare | Fresh tattoo, then "pool party tonight"; nurse Lockie brings the aftercare email (no pool, no sun, wash + moisturize), the floaty deflates; 2 weeks later, cannonball | Aftercare sent. Tattoo saved. |
| 2026-09-28 | walkin | Walk-in wants "just a quick one? right now?" mid-session; Lockie shows the next real opening, they book 4:30 PM with a deposit and come back right on time | Walk-ins welcome. At 4:30. |
| 2026-09-28 | bridal | A bridal party of six (bride in a veil + five bridesmaids); one link, the board fills as each books and pays her own deposit | Six in the party. Six deposits. |
| 2026-09-28 | voicenote | 3:07 AM 4-minute voice note ("a wolf but also my nan"); the artist sleeps while night-shift Lockie's link books Sat 1 PM, deposit floats in the window; wakes up booked | They book at 3 AM. You sleep. |
| 2026-09-28 | ghostback | March's no-show ghost is back ("hey stranger u free sat?"); bouncer Lockie says DEPOSIT FIRST; the ghost pays and turns into a real client | Ghosts welcome. Deposits first. |
| 2026-09-28 | vacation | Tech on the beach with cucumbers and a drink; pink Lockie flips BOOKS CLOSED to JOIN THE WAITLIST, tickets #1-#3; a week later BOOKS OPEN and the waitlist books with deposits | Go on vacation. Come back booked. |
| 2026-09-27 | fivemin | "5 min away" for 45 minutes while a tumbleweed rolls by; pink Lockie shows the late policy and the deposit already paid | "5 min away"? Deposit's paid. |
| 2026-09-27 | cousin | "Discount if I bring my cousin?" becomes a tower of five cousins; prices on the page, each books and pays their own deposit | Cousins welcome. Deposits too. |
| 2026-09-27 | beforeafter | Split screen, same artist: DM chaos and no-shows vs. one link, deposits and a locked calendar | Pick a side. (the right one) |
| 2026-09-27 | hearttattoo | Lockie books his own heart tattoo: flash, time, deposit, on the dot, BZZZZ, heart on the shackle | Even Lockie pays the deposit. |
| 2026-09-27 | doublebook | Two clients booked for 2 PM in a western standoff; Lockie shows a slot books once and the second takes 4 PM | One slot. One client. No duels. |
| 2026-09-26 | consult | Blurry "like this but different" photo; Lockie hands over the idea form, the artist quotes, the client books the quote | Less guessing. More tattooing. |
| 2026-09-26 | lastminute | Client cancels 1 hour before a lash set and wants the deposit back; pink Lockie shows the 24h policy, the deposit stays, the slot reopens | Cancel late? Deposit stays. |
| 2026-09-26 | stillavailable | "Is this still available?" ×40 on one flash sheet; Lockie's one link, designs get stamped TAKEN as clients book | Stop answering. Start booking. |
| 2026-09-26 | speedrun | Booking speedrun with a timer HUD: service, add-on, time, deposit, confirm in 9.4 s vs. the DM snail at 3 days | Booked in 10 seconds. Not 3 days. |
| 2026-09-26 | firstday | Lockie's first day learning the 3 rules; a coin bonks Lockie, who hands it straight to the artist | Hired. Forever. |
| 2026-09-25 | paperwork | A blizzard of paper consent forms buries the artist; Lockie pops out of the pile and the client signs on their phone | Sign here. (on your phone) |
| 2026-09-25 | patchtest | Lash client wants a full set today, no patch test; pink Lockie's 48 HOURS sign, a fake-nose disguise, then huge lashes 48h later | Patch test first. Lashes second. |
| 2026-09-25 | reunion | Every no-show of the year throws a party; Lockie crashes it with DEPOSIT FIRST, ghosts poof, real clients take over | RSVP: deposit first. |
| 2026-09-24 | screenshot | The Ghost "pays" with a fake Venmo screenshot; Lockie's magnifier, the artist's real $0.00, the hold's hourglass runs out | Nice try, ghost. |
| 2026-09-24 | tower | "Just a gel mani" grows a tower of add-on polish bottles that crashes; pink Lockie shows add-ons are picked, priced and timed at booking | Extras? Already booked. |
| 2026-09-24 | midnight | Books open at midnight; Lockie rings a bell and the waitlist books in single file, deposits into the artist's jar, while the artist sleeps | Books open. Chaos closed. |
| 2026-09-24 | squeeze | Nail tech at 7pm buried in "can u squeeze me in??"; pink Lockie shows the next real opening, client books, tech goes spa mode | Squeeze-ins? Not anymore. |

## Idea backlog

- Client asks to move the appointment 6 times
- Lockie's birthday: every client brings a deposit instead of a present
- Beauty: the client who books "just a fill" and asks for a full new set in the chair; services and times are set at booking
- The client who sends the deposit to the wrong Venmo; the page shows the artist's exact handle
- Tattoo convention week: the artist is away, books closed with a waitlist, opens after
