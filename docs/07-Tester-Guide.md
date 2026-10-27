# Tester guide — Hostmark VIP Guest Coordination

Thank you for testing. This page tells you how to sign in, what to try, and how to report problems. It takes about 30 minutes.

## 1. Signing in

Open the link you were given: the live site is **https://hostmark-vip.vercel.app** (locally: `http://localhost:3100`). All accounts use the same password. On the live site, the project owner gives it to you (it is `SEED_PASSWORD` in their `.env.deploy.local`, never in this repository). Locally it is **`Hostmark-Demo-2026`**.

| You are… | Email | Best on |
|---|---|---|
| Event coordinator | `coordinator@vipgcs.test` | Laptop |
| Programmes team | `programs@vipgcs.test` | Laptop |
| Front desk | `accommodation@vipgcs.test` | Phone |
| Housekeeping | `housekeeping@vipgcs.test` | Phone |
| Driver | `driver@vipgcs.test` | Phone |
| Admin (also has Settings) | `admin@vipgcs.test` | Laptop |

Tip: open two roles side by side (one in a private window) to watch changes arrive live.

The data is a made-up event, the **Lagos Leadership Summit**, starting today. Flights are **simulated** (the orange "SIMULATED" badge): nothing contacts real airlines.

## 2. What to try

Tick each item and note anything confusing, slow or wrong.

**Coordinator**
- [ ] **Dashboard**: the counts and decisions waiting for you make sense.
- [ ] **Intake**: open the review queue; approve one registration, look at the likely duplicate.
- [ ] **Arrivals**: ET512 is about 40 minutes late. Is that clear?
- [ ] **Transport**: approve or reject a suggested driver.
- [ ] **Rooms**: open the pending plan, approve some lines, then move a guest to another room (try an occupied room to see the warning).
- [ ] **Programme**: the *Welcome briefing* is at risk because the ET512 speaker is late. Press **Notify programme team**.
- [ ] **Sanitation**: rooms waiting to be cleaned, in priority order; reverse a check-out that has not been started.
- [ ] **Ask Co-Pilot** (top bar): try "Who arrives in the next 2 hours?", "Is ET512 delayed?", "Where is Dr Eze staying?", then "Add a note to Dr Eze: allergic to peanuts" — it only appears on her profile after you press **Approve**. Try your own wording too: tell us what it misunderstands.
- [ ] **Simulation**: run "One flight 45 minutes late" and watch Arrivals and Transport react.

**Programmes team**
- [ ] Add a programme item with a VIP participant; publish it; edit its time.

**Front desk (phone)**
- [ ] Check a party in (after the coordinator approved their rooms), then check them out. Try checking the same party out twice from two devices.

**Housekeeping (phone)**
- [ ] Start a room, mark it ready, use **Undo**; report a problem.

**Driver (phone)**
- [ ] Open today's trip, confirm the changed time, and step through Start → Picked up → Dropped off.

## 3. Reporting a problem

For each problem, note:
1. **Who** you were signed in as and on which device/browser.
2. **What you did**, step by step.
3. **What you expected** and **what happened** (a screenshot helps).

Send these to the project owner. Small wording or layout notes are welcome too.

## 4. Known limits in this test build

- The Co-Pilot understands a fixed set of question patterns (it does not use an AI model yet). Unusual wording may get a "try asking…" answer — please report those.
- The microphone in the Co-Pilot appears only in browsers with speech recognition (Chrome, Edge, Safari); in Chrome the audio is processed by Google.
- Emails are not sent; Cloudflare's bot check on the public registration form is off.
- The cleaning "ready by" estimate assumes enough cleaners; with a long queue it is optimistic.

## 5. For the person running the test

Reset to the starting data (stop the server first): `SEED_PASSWORD=Hostmark-Demo-2026 pnpm local:setup --reset`.
Smoke-test a running build: `E2E_BASE_URL=http://localhost:3100 pnpm test:e2e` (22 checks, read-only; see `playwright.config.ts`).
