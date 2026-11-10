# Tester guide — Hostmark VIP Guest Coordination

Thank you for testing. This page tells you how to sign in, what to try, and how to report problems. It takes about 30–45 minutes.

The live site is **https://hostmark.tech**. It starts **empty**: there is no demo data. Everything you see was entered by the project owner or by other testers, so feel free to create guests, rooms, trips and programme items — that is the test.

## 1. Signing in

The project owner creates an account for you. You get an **email from Hostmark** with a link to choose your password (it works once, for 72 hours; check your spam folder). If email is not working, the owner gives you a temporary password instead, and you choose your own at first sign-in. Forgot it later? Use **Forgot password?** on the sign-in page. Your account has one role:

| Role | What you test | Best on |
|---|---|---|
| Event coordinator | Intake, arrivals, transport, rooms, programme, sanitation, Victoria (the assistant), simulation | Laptop |
| Programmes team | Programme items and their VIP participants | Laptop |
| Front desk | Check-in and check-out | Phone |
| Housekeeping | Cleaning rooms | Phone |
| Driver | Today's trips | Phone |
| Admin | Settings (venue, rooms, drivers, accounts) plus the coordinator's screens | Laptop |

Tip: open two roles side by side (one in a private window) to watch changes arrive live.

Flights are **simulated** unless the owner switches them to live (the orange "SIMULATED" badge): in simulated mode nothing contacts real airlines, and landing times are set by hand or by the Simulation screen.

## 2. What to try

Tick each item and note anything confusing, slow or wrong.

**Guests (anyone with the registration link)**
- [ ] Open the public registration link from the owner and register a delegation with a flight number and arrival time, using an email address you can read: a confirmation with the reference should arrive. Try leaving fields out, and register the same person twice.

**Coordinator**
- [ ] **Intake**: approve a registration from the review queue; look at a likely duplicate; paste a free-text message ("Mr Ade arrives on ET900 tomorrow at 14:00, vegetarian") and check what was understood.
- [ ] **Dashboard**: the counts and decisions waiting for you make sense.
- [ ] **Arrivals**: set a landing time later than planned (or run a simulation) and check the flight shows as late.
- [ ] **Transport**: approve or reject a suggested driver; assign one by hand.
- [ ] **Rooms**: create a room plan, approve some lines, then move a guest to another room (try an occupied room to see the warning).
- [ ] **Programme**: an item with a late-arriving VIP is flagged "at risk"; press **Notify programme team**.
- [ ] **Sanitation**: rooms waiting to be cleaned, in priority order; reverse a check-out that has not been started.
- [ ] **Ask Victoria** (top bar; the assistant): "Who arrives in the next 2 hours?", "Is <flight> delayed?", "Where is <guest> staying?", then "Add a note to <guest>: allergic to peanuts" — it only appears on the profile after you press **Approve**. Try your own wording too: tell us what it misunderstands.
- [ ] **Simulation**: run "One flight 45 minutes late" and watch Arrivals and Transport react.

**Programmes team**
- [ ] Add a programme item with a VIP participant; publish it; edit its time.

**Front desk (phone)**
- [ ] Check a party in (after the coordinator approved their rooms), then check them out. Try checking the same party out twice from two devices.

**Housekeeping (phone)**
- [ ] Start a room, mark it ready, use **Undo**; report a problem.

**Driver (phone)**
- [ ] Open today's trip, confirm the time, and step through Start → Picked up → Dropped off; try **Call coordinator**.

**Programme Manager — once the multi-event update is deployed** (not on the live site yet)
- [ ] **Events** (sidebar): create a new event; it starts as a **Draft** while your live event keeps running.
- [ ] **Copy setup** into the draft from your live event (try only Rooms first, then the rest); **Team**: add a coordinator.
- [ ] **Work in this event**, then use the event name in the top bar to switch back and forth: each event shows only its own guests, rooms and trips.
- [ ] Try **Go live** on the draft while another event is live (it should refuse), then **Archive** the old one and go live.
- [ ] With a second Programme Manager: check that neither of you sees the other's events, staff or data.

## 3. Reporting a problem

For each problem, note:
1. **Who** you were signed in as and on which device/browser.
2. **What you did**, step by step.
3. **What you expected** and **what happened** (a screenshot helps).

Send these to the project owner. Small wording or layout notes are welcome too.

## 4. Known limits in this test build

- Victoria understands a fixed set of question patterns (it does not use an AI model yet). Unusual wording may get a "try asking…" answer — please report those.
- The microphone in Victoria appears only in browsers with speech recognition (Chrome, Edge, Safari); in Chrome the audio is processed by Google.
- Email covers account links and registration confirmations only; flight changes, pickups and rooms are in-app notifications. Cloudflare's bot check on the public registration form is off.
- The cleaning "ready by" estimate assumes enough cleaners; with a long queue it is optimistic.

## 5. For the person running the test

**Before testers arrive (once, in this order):**
1. Create your Super Admin from your laptop: `bash scripts/droplet-admin.sh --email you@example.com --name "Your Name"`. The temporary password appears once in your terminal; sign in at https://hostmark.tech and change it.
2. **Settings → System** (after the multi-event update: **Events → New event**, then **Work in this event**): create the event (name, venue, first and last day, time zone such as `Africa/Lagos`, arrival airports such as `LOS`). Leave flights **Simulated** unless an AeroDataBox key is configured.
3. **Settings → Rooms**: add room types (with cleaning times), then rooms by hand or **Import CSV**.
4. **Settings → VIP categories** and **Settings → Drivers** (with shifts covering the event days).
5. **Settings → Users**: invite one account per tester with the right role. With email on, each tester gets a set-password link (72 hours); "Reset password" sends a fresh one. If an email fails, the dialog shows a temporary password once instead: send it privately.
6. **Settings → System**: copy the public registration link and share it with whoever plays the guests.

**During and after:** the database is dumped nightly on the droplet (`/opt/hostmark/backups`, 7 days kept). To start over with an empty database, ask the developer: it wipes everything, including accounts.

**Local runs with demo data** (developers only): `SEED_PASSWORD=Hostmark-Demo-2026 pnpm local:setup --reset`, then `pnpm dev`; smoke-test with `E2E_BASE_URL=http://localhost:3100 pnpm test:e2e` (22 read-only checks, see `playwright.config.ts`).
