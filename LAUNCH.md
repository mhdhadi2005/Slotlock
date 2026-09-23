# Slotlock launch plan: first $1,000/month

*Lock the slot. Take the deposit. End no-shows.*

**Target:** 53 artists × $19 = $1,007 MRR. Realistic in 3–6 months with steady
outreach. This is a sales job more than a code job now: the product is built.

## Week 0: get it live (1–2 days)

- [ ] Buy the domain on GoDaddy: `slotlock.com`, else `getslotlock.com`, else
      `slotlock.app`. Skip the add-ons (email, site builder, SSL); Railway
      provides SSL free. Grab the `@slotlock` Instagram handle too.
- [ ] Deploy on Railway (README → Deploy). Point the domain at it.
- [ ] Stripe: test mode first, do one full booking with a test card
      (4242 4242 4242 4242), then switch to live keys.
- [ ] Resend: verify the domain so emails don't land in spam.
- [ ] `npm run seed` so `/demo` works. The landing page links to it.
- [ ] Make an Instagram account for the product. Post 3 things: what it is, a
      screen recording of booking in 30 seconds, and the pricing.

## Weeks 1–4: first 10 artists, by hand

Tattoo artists live on Instagram, and most run bookings through DMs and
Google Forms, often taking deposits by Venmo/CashApp/PayPal. That's the pain.

**Find them:** Instagram search `#[yourcity]tattoo`, `#[city]tattooartist`,
`#flashtattoo`, `#finelinetattoo`. Look for bios saying "DM to book", "books
open", "deposit required", or a Google Form link. Those are the exact
customers. Start with apprentices and newer solo artists (1k–20k followers):
they answer DMs and feel the no-show pain most.

**Volume:** 20 DMs a day, every day. Expect roughly 1 in 10 to reply and a few
of those to try it. Track everyone in a spreadsheet: handle, date DMed, replied,
signed up, paying.

**Founding-artist offer (first 10 only):** free for 3 months, then $9/month
forever, in exchange for honest feedback and a testimonial or story shout-out.
Set them up yourself on a call: add their services and hours, and paste the link
in their bio. Remove every bit of friction.

### DM scripts

**Opener (no pitch):**
> Hey! Love your fine line work. Quick q: do you still take bookings through
> DMs? I'm building a tool for artists and trying to understand how people
> handle deposits and no-shows.

**If they describe the pain:**
> That's exactly why I made this: one link for your bio, clients pick a time
> from your real openings and pay your deposit up front. Cancel late = you keep
> it, automatically. Here's what it looks like: [yourdomain]/demo
> I'm giving the first 10 artists 3 months free. Want me to set yours up? Takes
> me 10 min.

**Follow-up (3 days later, once):**
> No pressure at all. Just checking if you saw this. Happy to set it up for you
> if you want to try it on your next books-open drop.

**Books-open angle** (when an artist posts "books open"):
> Saw your books are opening! If you want, I can set you up with a booking link
> that takes deposits automatically, so no chasing Venmo. Free for 3 months.

## Months 2–3: 10 → 30

- **Referrals:** give each founding artist a "1 month free for every artist you
  refer" deal. Artists know other artists, and shops have 3–8 of them.
- **Shops:** pitch shop owners directly. One yes can mean 5 artists. Offer a
  shop discount (e.g. $15/artist for 4+).
- **Content:** short Reels/TikToks: "How I stopped losing $300 to no-shows",
  screen recordings of a client booking in 30 seconds, before/after of a DM
  inbox. Post from the product account, and ask founding artists to share.
- **"Booking by Slotlock"** is on every client-facing page. Each booking page is
  an ad seen by other people who get tattooed, some of whom are artists.
- **Communities:** r/tattooartists and artist Facebook groups. Answer questions
  about deposits and no-shows helpfully first, and mention the tool only when relevant.

## Months 3–6: 30 → 53+

- Expand to hair stylists, nail and lash techs (same product, same pain). Add a
  landing page variant per niche (`/for/nails`, `/for/hair`) with its own copy.
- SEO pages: "tattoo deposit policy template", "how to take tattoo deposits",
  "Google Form alternative for tattoo booking". These are searches your buyers make.
- Build the #1 requested feature from founding artists (likely: SMS reminders,
  request-then-approve for big pieces, or image uploads).

## Numbers to watch

| Metric | Healthy early target |
| --- | --- |
| DM → reply | 10%+ |
| Reply → signup | 30%+ |
| Signup → first real booking within 7 days | 50%+ (if not, fix onboarding) |
| Trial → paid | 30%+ |
| Monthly churn | under 5% |

If artists sign up but never get a booking, the problem is setup, not price:
do the setup for them.

## Honest risks

- **Competition:** Square Appointments, Vagaro, GlossGenius, Booksy, and
  tattoo-specific tools exist. The pitch is *simple, cheap, made for solo
  artists who book on Instagram*. Don't try to out-feature the big ones.
- **Instagram DMs are slow** and can get rate-limited if you paste the same
  message too often. Personalise the first line every time.
- **Stripe Connect region:** your platform account's country decides where
  artists can be. Start with your own country.
