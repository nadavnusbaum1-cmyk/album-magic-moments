
# Go-to-market plan

Big scope — I'd recommend shipping this in 4 phases, each independently testable. Don't try to do all at once.

---

## Phase 1 — Pricing model & entitlements (foundation)

Two audiences, one billing system based on **event credits**:

**Couples (one-time)**
- **Single Event – $39**: up to 300 photos, 1 event, 30-day album lifetime
- **Single Event Plus – $79**: up to 1,500 photos, 1 event, 1-year album lifetime, WhatsApp delivery included

**Photographers (subscription)**
- **Starter – $29/mo**: 3 events/mo, 500 photos/event
- **Pro – $79/mo**: 10 events/mo, 2,000 photos/event, WhatsApp delivery
- **Studio – $199/mo**: unlimited events, 5,000 photos/event, white-label option later

> Numbers are starting points based on comparable tools (POV, Joy, Wedshoots charge $25–$99/event; pro tools like Pic-Time/Pixieset are $20–$50/mo). We can A/B test after launch.

**DB changes:**
- `subscription_plans` table (seed with the 5 plans above)
- `user_entitlements` table: `user_id`, `plan_id`, `events_remaining`, `events_per_month`, `photo_limit_per_event`, `period_end`, `status`
- `event_purchases` table: links a one-time payment to a specific event
- New trigger on `events` insert: check entitlement, decrement counter, block if exhausted
- Frontend: show remaining quota in dashboard header; block "Create event" CTA when out

---

## Phase 2 — Payments (Lovable's built-in Stripe)

Use **Stripe Payments** (seamless, no Stripe account needed to start). Paddle would also work but Stripe is more flexible for the mixed one-time + subscription model.

- Enable via `enable_stripe_payments` (requires Pro plan on Lovable)
- Create 5 products in Stripe (2 one-time, 3 recurring)
- Build `/pricing` page with checkout buttons → Stripe-hosted checkout
- Webhook handler (`stripe-webhook` edge function) updates `user_entitlements` on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Customer portal link in dashboard for subscription management
- Tax handling: start with "tax calculation only" (+0.5%) — covers VAT/sales tax without you having to file

---

## Phase 3 — Landing page (`/`)

Replace current `Index.tsx` with a real marketing site:

1. **Hero**: "AI photo albums your guests will actually use" + 30-sec demo video/GIF + "Start free" CTA
2. **How it works**: 3 steps with screenshots (upload → AI face match → guests find themselves)
3. **Live demo**: link to a real published sample event (`/e/sample-wedding`)
4. **Features grid**: AI face recognition, instant guest access, WhatsApp delivery, gallery downloads, mobile-first
5. **Testimonials**: 3 placeholder quotes (replace with real ones post-launch)
6. **Pricing**: tabs for "I'm planning an event" vs "I'm a photographer"
7. **FAQ**: 8–10 questions (cost, photo limits, privacy, how long albums stay live, etc.)
8. **Footer**: Terms, Privacy, Contact

New pages: `/terms`, `/privacy`, `/pricing`, `/demo`

SEO: proper meta tags, Open Graph image, JSON-LD for SoftwareApplication, sitemap.

---

## Phase 4 — WhatsApp delivery (Twilio)

Send the public album link to a broadcast list of phone numbers.

- Connect **Twilio** via the connectors flow (you'll need a Twilio account + WhatsApp Business sender approved — ~1–3 day approval)
- New page in EventAdmin: "Share via WhatsApp"
  - Textarea for phone numbers (CSV or one per line, E.164 format)
  - Optional custom message (default: "Hi! Photos from {event_name} are ready: {album_link}")
  - Send button → calls new edge function `send-whatsapp-broadcast`
- Edge function loops through numbers, calls Twilio Messages API one-by-one (no real broadcast API on WhatsApp), logs each send to a new `whatsapp_sends` table for delivery tracking
- Rate limit: 10 sends/sec to stay under Twilio limits
- Gate behind paid plans (Single Event Plus, Pro, Studio)

**Costs to disclose to user**: Twilio charges ~$0.005–0.08/WhatsApp message depending on country. You'll either eat this or pass through.

---

## Phase 5 — Security hardening (do before launch)

Run a full pass:
- Enable **Leaked Password Protection** (HIBP) in auth settings
- Audit RLS policies — currently `photos`, `guests`, `face_clusters` etc. only allow host SELECT, which is correct. Verify the public album route uses an edge function with the album token (not direct table access).
- Add rate limiting to public edge functions (`get-album`, `register-guest`, `guest-sign-s3-upload`) — there's no built-in, will use a simple per-IP table
- Run `security--run_security_scan` and fix all findings
- Add **Terms of Service** acceptance checkbox at signup
- Add **GDPR**: data export endpoint, account deletion endpoint, cookie banner if you target EU
- Verify S3 bucket policy doesn't allow public listing (just public read on signed paths)
- Add CAPTCHA (hCaptcha) on signup to prevent bot abuse

---

## Recommended order

1. **Phase 1 + 2 together** (entitlements + Stripe) — biggest unlock, ~1 build session each
2. **Phase 3** (landing page) — needed before driving traffic
3. **Phase 5** (security) — before any public marketing
4. **Phase 4** (WhatsApp) — last, since it requires Twilio approval lead time

---

## What I need from you to start

1. **Confirm pricing** — keep my suggestions or adjust the numbers?
2. **Which phase first?** I'd recommend Phase 1+2 (entitlements + Stripe).
3. **Lovable plan** — Stripe payments needs Pro plan on Lovable. Are you on it?
4. **Twilio account** — do you already have one, or want me to defer Phase 4 until you create one?
5. **Brand for landing page** — any existing logo/colors/copy direction, or should I propose design directions?
