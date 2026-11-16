# 01 — Product Requirements Document (PRD)

**Product:** Hostmark — VIP Guest Coordination System (VIP GCS)

**Status:** v1.1, 2026-10-19. All [Proposed] items were confirmed on 2026-10-19 (§9). The frontend follows the Figma Make design "Hostmark"; where it differs from this PRD, the design decides look and flow and this PRD decides rules.

**Scope source:** [`00-Project-Breakdown.md`](00-Project-Breakdown.md), which is the agreed project understanding (v2). This PRD turns it into numbered, testable requirements.

> **Legend:** items marked **[Proposed]** are reasonable defaults written to fill gaps in the breakdown. They need your confirmation and are collected in §9.

---

## 1. Overview

VIP GCS is a web system for coordinating VIP guests at one large event in one venue. It brings guest intake, flight tracking, ground transport, room allocation, room turnaround and the event program into **one shared data model**. A change in one place, such as a flight delay, then flows to everything it affects. An AI layer turns messy input into structured data. A typed or spoken Co-Pilot answers questions from live data. Throughout, **the system recommends and the coordinator decides.**

It is a final-year Computer Science project. Every module must be buildable, testable and **measurable** (§8).

## 2. Goals

### Product goals
1. **One source of truth.** Guests, delegations, flights, pickups, drivers, rooms, cleaning and program items all live in one database. Staff screens read from it in real time.
2. **Faster coordinator decisions.** The coordinator sees "what needs my decision now" first, and each decision takes one tap.
3. **Automatic knock-on effects.** A flight change produces updated pickup times and, if needed, driver reassignment proposals within seconds, with no manual re-entry.
4. **Messy input in, clean data out.** Free text and pasted messages become structured guest records. Problems are flagged rather than silently accepted.
5. **Trustworthy automation.** Every automatic action is logged and undoable. Every resource-committing action needs one-tap approval.

### Project (academic) goals
6. Each module has a defined input, output and metric, plus a repeatable evaluation script (see `02-TRD.md` §8).
7. The system is demonstrable on demand through **simulated mode**, without depending on real flights being delayed.

### Non-goals
See [`00-Project-Breakdown.md` §8–9](00-Project-Breakdown.md#8-not-in-the-first-version-optional-or-future). In short: no live traffic prediction, no WhatsApp/SMS/email sending, no screenshot/PDF intake (stretch), no Co-Pilot actions beyond the agreed set, no multi-venue support within one event (multi-event support is built on a branch, §5.7), no hotel booking or fleet management.

## 3. Target users and roles

| Role (system key) | Who | Device | What they do | Sees |
|---|---|---|---|---|
| **Programme Manager** (`programme_manager`) — **[Built on branch, §5.7]**: Events page, event switcher, staff per event, copy setup | Runs one or more events for a client or programme (not the Programs team below) | Desktop | Creates events (drafts), sets one of their own events **Live** at a time, archives finished ones, sets up each event's venue, rooms and drivers (or copies them from an earlier event), creates staff accounts and assigns staff to their events | Their own events, all data in them |
| **Super Admin** (`super_admin`) | System owner, e.g. the project lead | Desktop | Everything an Admin can do, plus manage Admin accounts, system settings (flight provider mode, AI and provider configuration), data export/purge, full audit log | Everything |
| **Admin** (`admin`) | Event operations lead | Desktop | Everything a Coordinator can do, plus manage staff accounts, venue setup (rooms, wings, room types, cleaning durations), drivers and vehicles, event settings, intake link | Everything except system settings |
| **Coordinator** (`coordinator`) — *main user* | Event coordinator(s) | Desktop/tablet, phone for Co-Pilot | Review intake, approve proposals, edit allocations, set VIP category and team groupings, use the Co-Pilot, reverse checkouts, undo automatic actions, run simulations | Everything operational |
| **Programs team** (`programs`) | Program/protocol planners | Desktop | Draft and publish the event program (agenda items, timings, locations, VIP participants). See arrival status for program participants. | Program, participant arrival status |
| **Driver** (`driver`) | Assigned drivers | Phone | See their own pickups, acknowledge changes, update trip status | **Only their own** pickups |
| **Accommodation & logistics** (`accommodation`) | Front desk / logistics / protocol | Phone/tablet | See arrivals and room allocations, mark guests **checked in** and **checked out** | Arrivals, allocations |
| **Housekeeping** (`housekeeping`) | Sanitation teams | Phone | See the prioritized cleaning list, mark cleaning started/done | Rooms and priorities, **not** guest identities |
| **Guest / secretariat** (no account) | VIPs or their assistants | Any browser | Fill in the intake form through the shared link | Only the form and its confirmation |

**[Proposed]** The role hierarchy is `super_admin ⊇ admin ⊇ coordinator`. `programs`, `driver`, `accommodation` and `housekeeping` are separate, least-privilege roles. Each user has exactly one role.

## 4. Core principles

### P1 — Recommend, then decide (the automation boundary)

| The system does it **automatically** (logged, undoable) | The system **proposes**, the coordinator **approves with one tap** |
|---|---|
| Create a guest/delegation record from a clean (high-confidence) submission | Room assignments, whether a full plan or a single guest |
| Normalize fields (names, titles, flight numbers, dates, phone numbers) | Driver assignment to a pickup |
| Update arrival times from the flight API | Driver reassignment after a delay or other change |
| Change statuses (flight status, pickup status, room/cleaning status) | Co-Pilot write actions |
| Link **exact** duplicate submissions | Merging **likely** duplicates (review, never auto-merge) |

**High-confidence** is rule-based, not the AI's own score. It means all of the following hold: all required fields are present, every validation check passed, there is no likely duplicate, and nothing was flagged in the "others" field.

**[Proposed — interpretation]** If a flight change moves an already-approved pickup and **the same driver is still free** at the new time, the system updates the pickup time automatically (an information update) and notifies the driver. Only a **change of driver** needs a proposal.

### P2 — Everything is logged; automatic actions are undoable
Every write records who (user, system, Co-Pilot or guest intake), what, when, and the before/after values. Automatic actions can be undone by the coordinator. Undo is refused if the record has changed since; the coordinator is shown why.

### P3 — Shared data, chain reactions
Modules never keep private copies of guests, flights, drivers or rooms. A change publishes an event that the other modules react to (flight → pickups → drivers → rooms → program conflicts → dashboard).

### P4 — Least privilege
Staff screens show only what each role needs. Drivers see only their own jobs. Housekeeping sees room numbers and priorities, not who is staying there. VIP itineraries are security-sensitive.

## 5. Functional requirements

Requirement IDs (`FR-xx-nn`) are referenced by the implementation plan and the tests.

### 5.0 Platform (M0)

| ID | Requirement |
|---|---|
| FR-PL-01 | Staff sign in with email and password. Accounts are created by Admin/Super Admin. **[Proposed]** New accounts get a temporary password and must change it at first sign-in. No self-sign-up. |
| FR-PL-02 | Role-based access is enforced **in the database** (row-level security), not only in the UI. |
| FR-PL-03 | Admin can configure the event: name, venue, dates, timezone, expected arrival airport(s), fixed buffers (airport exit buffer, airport→venue travel time, local pickup travel time), and the intake link (open/close/regenerate). |
| FR-PL-04 | Admin can configure the venue: wings, floors, rooms (number, floor, wing, position along the corridor, room type, capacity, accessible yes/no, out of service) and room types (name, tier, default capacity, fixed cleaning minutes). Supports CSV import. |
| FR-PL-05 | Admin can manage drivers (name, phone, linked login, vehicle label, vehicle capacity) and their shifts. |
| FR-PL-06 | The coordinator can manage **VIP categories**, an ordered rank list (e.g. 1 = Head of State/Minister, 2 = Clergy/Executive, …). **[Proposed]** The labels are editable per event. |
| FR-PL-07 | An **audit log** records every write. The coordinator can filter it by entity, actor and time, and undo automatic actions (P2). |
| FR-PL-08 | **In-app notifications** are delivered in real time to a user or role (bell + toast; staff screens also show a banner and play a sound). No SMS, WhatsApp or email. |
| FR-PL-09 | A **pending decisions queue** lists every open proposal and review item, each with its reason, approve/reject buttons, and bulk approve for plans. |
| FR-PL-10 | **Simulated mode** (Admin/Coordinator) replays scripted flight scenarios through the same pipeline as live data, with optional time acceleration. A persistent banner shows when simulated mode is on. |

### 5.1 Guest Intake & Validation (M1)

**Intake form fields** (public, mobile-first, no login):

| Field | Required | Notes |
|---|---|---|
| Guest full name | Yes | |
| Title / honorific | No | e.g. "Bishop", "Hon. Minister", "H.E." |
| Organisation / position | No | |
| **Submitter contact** (name + phone or email) | Yes, at least one of phone/email | **[Proposed]** So the coordinator can follow up with the secretariat. |
| **How are you arriving?** | Yes | Flying / Own transport / Need pickup from my location |
| ↳ Airline, flight number, arrival date | Yes, if **Flying** | Flight number is validated and normalized (e.g. `ek 783` → `EK783`). |
| ↳ Arrival date and time | Yes, if **Own transport** | No driver is assigned. |
| ↳ Pickup address, pickup date and time | Yes, if **Need pickup** | |
| Expected departure date | **[Proposed]** Yes (defaults to the event end date) | Needed for room occupancy windows and the cleaning estimate (expected checkout). |
| Team size (people accompanying the VIP) | Yes (0 allowed) | |
| Team members (name + role), repeatable | No | Roles: assistant, security, performer (e.g. backup singer), representative, family, other. Can be completed later by the coordinator. |
| Dietary requirements | No | Multi-select + free text |
| Others (free text) | No | Structured by AI |
| Privacy notice + consent | Yes | **[Proposed]** Short notice on how the data is used and retained. |

| ID | Requirement |
|---|---|
| FR-IN-01 | One shared intake link (`/intake/<token>`). Admin can close or regenerate it. The form shows/hides fields by arrival mode. |
| FR-IN-02 | The form is protected against abuse with a bot challenge and per-IP rate limiting. It never reveals other submissions. |
| FR-IN-03 | On submit, the system shows a confirmation with a reference code. The submission appears on the coordinator dashboard in real time. |
| FR-IN-04 | **AI extraction** turns the "others" field into typed items: dietary, accessibility/mobility, room preference, security, transport, schedule, medical, other. Each item records whether it **conflicts** with a form field or **needs coordinator attention**. |
| FR-IN-05 | **Pasted message intake:** the coordinator pastes a free-text message (e.g. a forwarded WhatsApp message). The AI produces a draft intake record, which the coordinator corrects and confirms before it enters the pipeline. |
| FR-IN-06 | **Validation checks** (rule-based) include: required-by-mode fields present; flight number format; airline matches flight-number prefix; arrival and departure dates within the travel window (N days before the start to N days after the end, configurable; the public form only offers those dates); departure ≥ arrival; listed members ≤ team size, with a mismatch warning; optional flight lookup (flight exists on that date and arrives at an expected airport); AI-flagged conflicts. |
| FR-IN-07 | **Normalization:** names and titles (casing, honorifics separated), phone numbers (E.164), flight numbers (IATA), dates/times (to UTC, displayed in the event timezone). |
| FR-IN-08 | **Duplicate detection:** an *exact* duplicate (same normalized name + same arrival details + same contact) is linked to the existing record automatically and logged. A *likely* duplicate (fuzzy name match + same date or flight, or same contact) is sent to review with a side-by-side comparison. Records are never auto-merged. |
| FR-IN-09 | **Auto-processing:** a high-confidence submission (P1) automatically creates a delegation, the principal guest, placeholder or named members, the arrival record, a tracked flight (if flying) and a pickup (if flying or pickup). Everything else goes to the **review queue**. |
| FR-IN-10 | **Review queue:** the coordinator sees issues per submission and can edit, approve (creating records), mark as duplicate/link, or reject. |
| FR-IN-11 | The coordinator sets each guest's **VIP category**, **delegation (team grouping)**, **room-share grouping** and **proximity priority**. Guests never set these. |

### 5.2 Live Flight Tracking & Transport (M2)

| ID | Requirement |
|---|---|
| FR-FT-01 | Each distinct flight (flight number + date) is tracked once, however many guests are on it. |
| FR-FT-02 | Shows flight phase (scheduled, in the air, landed, cancelled, diverted, unknown) and a **delayed** badge when the estimated arrival is later than scheduled by more than a threshold (default 15 min). |
| FR-FT-03 | **Adaptive polling:** flights are checked more often as their arrival approaches (e.g. daily until T−24h, every 30 min from T−6h, every 5–10 min from T−2h until landed) to stay within the API quota. |
| FR-FT-04 | A flight change updates the expected arrival for every linked arrival record (automatic, logged). |
| FR-FT-05 | **Pickups:** Flying arrivals get an airport pickup with pickup time = estimated arrival + airport exit buffer. "Need pickup" arrivals get a location pickup at the requested time. "Own transport" arrivals get none. |
| FR-FT-06 | **Driver matching** proposes a driver who is active, on shift for the whole trip window (pickup − travel time → pickup + travel time), has no overlapping job, and whose vehicle capacity covers the passengers (or a set of drivers/vehicles for large delegations). Ranking prefers keeping the current driver, then a balanced workload. The proposal lists up to 2 alternatives. |
| FR-FT-07 | **Cascade:** when a flight change makes the assigned driver unavailable, the system creates a **driver reassignment proposal** and notifies the coordinator. If the driver is still free, the time updates automatically and the driver is notified (P1 interpretation). |
| FR-FT-08 | **Cancellations/diversions** flag the arrival for coordinator review and propose releasing the pickup. |
| FR-FT-09 | **Driver screen:** a list of my pickups (time, guest name/title, flight and status, pickup point, passengers), an acknowledge button for changes, and one status button that advances En route → Picked up → Completed. |
| FR-FT-10 | **Simulated provider:** scenarios (e.g. "EK783 delayed 45 min at T−2h", "flight cancelled", "early arrival") run through the same ingestion function as live updates. |
| FR-FT-11 | The coordinator can refresh a flight manually and override an arrival time manually (logged). |

### 5.3 Room Allocation (M3)

| ID | Requirement |
|---|---|
| FR-RA-01 | **Hard rules (must hold):** the room is free for the stay window; room capacity ≥ the people sharing it; the room is ready (clean, or estimated ready before the expected arrival); not out of service; checked-in guests are never moved. |
| FR-RA-02 | **Preferences (weighted):** room tier matches VIP rank; ground floor when requested or when an accessibility need was extracted; entourage members near their principal (weighted by each member's proximity priority); members of the same team near each other. |
| FR-RA-03 | **Entourage:** each member gets their own allocation (not necessarily the VIP's room or room type). Members can share a room only if the coordinator puts them in the same **room-share group**. **[Proposed]** By default the principal never shares and members don't share. |
| FR-RA-04 | **Plan run:** the coordinator runs the allocator for unallocated guests. The result is one **plan proposal** with per-guest assignments, a score breakdown (which rules and preferences were met or missed, and why), and an overall satisfaction %. Approve all, or approve/reject individual lines. |
| FR-RA-05 | **Incremental proposals:** a guest created after a plan was approved gets an individual room proposal. |
| FR-RA-06 | **Manual edits:** the coordinator can assign or move any guest by hand. If this breaks a hard rule or drops preferences, the system shows the warnings first and requires an explicit "assign anyway" with a reason. Logged. |
| FR-RA-07 | **Rework on change:** a cancellation or delay re-plans only **not-yet-checked-in** allocations affected by the change, and outputs proposals. |
| FR-RA-08 | **Room view:** a grid by floor/wing showing each room's status (free, reserved, occupied, needs cleaning, cleaning, out of service), its occupant group, and readiness vs the next arrival. |
| FR-RA-09 | **Accommodation screen:** today's arrivals and allocations, with **Check in** and **Check out** buttons. **[Proposed]** Check-in is added here because the "never move checked-in guests" rule needs someone to record it. |

### 5.4 Natural Language Co-Pilot (M4)

| ID | Requirement |
|---|---|
| FR-CP-01 | A chat panel available from every coordinator screen (and to Admin/Super Admin). |
| FR-CP-02 | Answers questions using **typed read tools** over live data (arrivals by time window/category/missing driver/room not ready; guest lookup; flight status; pickups; rooms; cleaning queue; program; who is affected by a change; pending decisions). **No free-form SQL generation.** |
| FR-CP-03 | Answers cite the records they used (guest names, flight numbers, rooms) and link to them. |
| FR-CP-04 | **Write actions** (agreed small set, **[Proposed]**): (a) move a guest/delegation to other rooms or another wing, (b) assign/reassign a driver to a pickup, (c) add an internal note to a guest/pickup. Each creates a **proposal** shown inline with Approve/Reject. Nothing is written until the coordinator approves. |
| FR-CP-05 | **Voice:** push-to-talk recording → transcript shown in the input box, editable → the coordinator sends it. Guest names, titles and wing names are supplied to the speech recognizer as vocabulary hints. |
| FR-CP-06 | Every Co-Pilot exchange is stored (question, input mode, original transcript, tools called, answer, latency) for evaluation and audit. |

### 5.5 Room Turnaround & Cleaning (M5)

| ID | Requirement |
|---|---|
| FR-CL-01 | **Check out** is available to Accommodation & logistics (and the coordinator). **The first confirmation wins.** A second attempt shows "Already checked out by <name> at <time>". |
| FR-CL-02 | Checkout sets the room to *needs cleaning*, creates a cleaning task, and notifies housekeeping in real time. |
| FR-CL-03 | **Estimated ready time** = checkout time (actual or, before checkout, expected) + fixed cleaning minutes for the room type + delay buffer. |
| FR-CL-04 | **Cleaning priority:** rooms with the soonest incoming guest first (by the next allocation's expected arrival), then by estimated ready time. |
| FR-CL-05 | **Housekeeping screen:** an ordered list (room number, floor/wing, room type, "needed by" time, priority badge) and one button that advances Start → Done. Done sets the room to clean. |
| FR-CL-06 | The coordinator can **reverse a mistaken checkout**. The room status is restored and an unstarted cleaning task is cancelled. Logged. |

### 5.6 Event Program (M6) — Programs team

> The breakdown names the programs team as "in charge of drafting the program/event flow and scheduling in general" and puts them in the MVP. The scope below is a **[Proposed]** minimum that connects to the shared data. Please confirm.

| ID | Requirement |
|---|---|
| FR-PG-01 | The programs team creates, edits and publishes program items: title, type (session, ceremony, meal, performance, other), start/end, location within the venue, description. |
| FR-PG-02 | Program items list **VIP participants** (speaker, honoree, performer, attendee). |
| FR-PG-03 | **Arrival conflict check:** if a participant's expected arrival at the venue (arrival + travel buffer) is after the item's start (minus a configurable lead time), the item is flagged *at risk*. The programs team and the coordinator are notified. Re-checked whenever arrivals change. |
| FR-PG-04 | The coordinator sees the published program as a timeline. The Co-Pilot can answer program questions. |
| FR-PG-05 | **[Future]** Transport scheduling for program movements (e.g. hotel → ceremony venue). |

### 5.7 Multiple events and Programme Managers — **[Built on branch `feat/multi-event`, not deployed yet]** (requested 2026-11-10; [`06`](06-Implementation-Plan.md) P9)

Today one installation runs exactly one event. The system must instead host **many events at once**: each **Programme Manager** runs their own events, with **at most one of them live at a time**, while several Programme Managers run their live events in parallel. Decisions taken with the project owner on 2026-11-10:

| ID | Requirement |
|---|---|
| FR-ME-01 | New role **Programme Manager**. A Programme Manager owns the events they create; a Super Admin sees and can manage every event. |
| FR-ME-02 | Each event has a status **Draft → Live → Archived**. A Programme Manager may have at most **one Live** event; going live with another first asks to archive (or return to draft) the current one. Archived events are read-only. Drafts can be fully set up in advance. |
| FR-ME-03 | Staff (Admin, Coordinator, Programs team, Front desk, Housekeeping, Driver) are **assigned to events**. They see only events they are assigned to; one person may be on several. A person on several live events picks which one they are working on (a switcher in the top bar); a person on one event goes straight to it. |
| FR-ME-04 | Every record (guests, flights, trips, rooms, cleaning, programme, proposals, notifications, Victoria's log, audit) belongs to one event. Nobody can read or change another event's data, enforced by row-level security, not only by screens. |
| FR-ME-05 | Venue, rooms, room types, VIP categories and drivers are **per event**. Setting up an event offers **copy from a previous event** (rooms, room types, categories, drivers; never guests). |
| FR-ME-06 | Each event keeps its own registration link, flight mode, simulation, background work and Victoria context. The worker processes every live event. |
| FR-ME-07 | Event export and post-event purge (FR-PL) work per event; a Super Admin can purge any archived event. |

**Open:** whether an Admin keeps account management across all events (proposed: Admin powers apply only inside events they are assigned to; creating accounts is for Programme Managers and Super Admins).

### 5.8 Public landing page and demo requests — **[Built 2026-11-16]**

Event organisers deciding whether to use Hostmark need somewhere to learn what it does; until now `/` sent everyone straight to sign-in.

| ID | Requirement |
|---|---|
| FR-LP-01 | `/` shows a public landing page to anyone not signed in (signed-in staff still go to their home screen): the problem, how a flight delay is handled, the six modules with screenshots, measured results, safeguards and the staff sign-in. It is the only page search engines may index. |
| FR-LP-02 | **Request a demo**: name, organisation, work email, optional event size and message. The request is emailed to `DEMO_REQUEST_TO` with replies going to the requester; nothing is stored. At most 5 requests per 10 minutes per IP, plus a hidden honeypot field. Without `DEMO_REQUEST_TO` (or without email) the form says requests are not open yet. |
| FR-LP-03 | Every figure on the page comes from `pnpm eval:all` and says how and when it was measured (`features/landing/content.ts`). |

## 6. User stories

**Coordinator**
- As a coordinator, I see a "needs my decision" list first thing, so I act on what matters before reading everything else.
- As a coordinator, when a flight is delayed I get one proposal ("Reassign EK783 pickup from Driver A to Driver B, A is on another job at the new time") and approve it with one tap.
- As a coordinator, I paste a forwarded WhatsApp message and get a pre-filled guest record to check, instead of typing it.
- As a coordinator, I run the room plan and see why each VIP got their room and which preferences couldn't be met.
- As a coordinator, I move the Bishop's security team to the same wing and am warned before I break a rule.
- As a coordinator walking the lobby, I hold the mic button and ask "Which ministers land in the next 2 hours with no car or no room ready?", check the transcript, and get an answer with links.
- As a coordinator, I undo an automatic merge or arrival-time change that was wrong.

**Admin / Super Admin**
- As an admin, I import the hotel's room list from CSV and set cleaning minutes per room type.
- As an admin, I create driver and housekeeping accounts and deactivate them after the event.
- As a super admin, I switch the system to simulated mode for a demo and back to live mode.

**Programs team**
- As a programs officer, I draft the opening ceremony with three VIP speakers and get warned if one of them lands too late to make it.

**Driver**
- As a driver, I see my next pickup with the flight's live status, and I get an alert and an acknowledge button when it changes.

**Accommodation & logistics**
- As front-desk staff, I check a guest in or out with one button. If my colleague already did it, I see who and when.

**Housekeeping**
- As a cleaner, I see which room to clean next and tap Start/Done.

**Guest / secretariat**
- As a VIP's assistant, I fill in the form on my phone in under 3 minutes, see only the fields that apply to how we're arriving, and get a reference code.

## 7. Key assumptions

- One event, one venue, one coordinating team ([`00` §10](00-Project-Breakdown.md#10-boundaries-to-keep-the-project-realistic)).
- Test data is synthetic or volunteer-submitted. The flight API is real, with simulated mode for repeatable tests.
- Staff have a smartphone with a modern browser and mobile data at the venue.
- The coordinator's decisions are final. The system never overrides a coordinator's manual change.

## 8. Success metrics

Targets are **[Proposed]** values for the evaluation chapter. Adjust them with your supervisor. Each one is measured by a script described in `02-TRD.md` §8.

| Module | Metric | How measured | Proposed target |
|---|---|---|---|
| M1 Intake | Field extraction accuracy (per-field precision/recall/F1) | Labelled set of ≥ 100 intake texts (synthetic + volunteer) vs gold fields | F1 ≥ 0.90 |
| M1 Intake | Problem detection (missing/inconsistent/duplicate) | Same set, with seeded problems | Recall ≥ 0.90, precision ≥ 0.80 |
| M1 Intake | Auto-processing safety | % of auto-processed submissions later corrected by the coordinator | ≤ 5% |
| M2 Transport | Reassignment latency | Time from flight update ingested → proposal created (simulated scenarios) | p95 ≤ 5 s |
| M2 Transport | Reassignment correctness | % of proposals that are feasible (driver free, on shift, capacity OK, no overlap) | 100% |
| M3 Rooms | Hard-rule satisfaction | % of allocations that satisfy all hard rules | 100% |
| M3 Rooms | Preference satisfaction | Weighted % of preferences met, compared with a naive "first free room" baseline | Clearly above baseline (report the gap) |
| M4 Co-Pilot | Answer accuracy | Test set of ≥ 50 questions with expected answers on a fixed seed dataset | ≥ 85% |
| M4 Co-Pilot | Action selection accuracy | Test set of ≥ 20 action requests: correct tool + correct arguments | ≥ 90% |
| M4 Co-Pilot | Voice transcript accuracy on names | Word error rate on a recorded set of name-heavy questions, with vs without vocabulary hints | Report both |
| M5 Cleaning | Flow reliability | % of checkouts that produce a cleaning task + housekeeping notification within 5 s | ≥ 99% |
| M5 Cleaning | Estimate error | Mean absolute error between estimated and actual ready time (in trials) | ≤ 15 min |
| All | Decision speed (usability) | Task time for 3 scripted coordinator tasks vs a spreadsheet + chat baseline (small user test) | Report the gap |

## 9. Decisions and open questions

Confirmed on 2026-10-19 (the [Proposed] markers above stand for these confirmed defaults):

1. ✅ Role permissions (§3) and the hierarchy `super_admin ⊇ admin ⊇ coordinator`.
2. ✅ P1 interpretation: if the same driver is still free after a delay, the time shift is automatic.
3. ✅ Intake additions: submitter contact, expected departure date, consent notice.
4. ✅ Room sharing: the principal never shares; members share only by coordinator grouping.
5. ✅ Co-Pilot write actions: move rooms, assign driver, add note.
6. ✅ Programs module scope as in §5.6.

Rule reconciliations with the Figma design (the PRD wins on rules):
- The design's registration form asks the guest for a **VIP category**; FR-IN-11 says only the coordinator sets it, so the public form does not ask for it.
- The design's form has no **"Others"** free-text field or airline field; they are added because FR-IN-04 (AI extraction) and the flying rules depend on them.
- The design requires every companion's name and an arrival time for every mode. FR-IN-09 allows placeholder members, so companion names are optional (unnamed companions become placeholders and do not block automatic processing), and the landing time is optional when flying (flight tracking supplies it).

Decisions made while building P2 (2026-10-20):
- An *exact* duplicate is linked automatically only when it brings nothing new (same party size and departure, no note); otherwise it goes to review as a likely duplicate, so updates are never lost silently.
- The guest is never told that a similar registration exists (that would let anyone with the link check who is coming); the "we may contact you" note reflects only problems in what they sent.
- Automatic processing is undone per submission (the whole delegation it created), not row by row.
- AI judgement can raise but never lower the bar: medical, security, schedule and other items always need a person, and an empty reading of a non-empty note goes to review.

Still open:
7. Venue location, timezone and arrival airport(s). The demo data assumes Lagos (LOS); they are editable in Settings → System.
8. Project timeline: submission/demo dates, so phases in `06` can be scheduled.
9. Success-metric targets (§8): agree them with your supervisor.
