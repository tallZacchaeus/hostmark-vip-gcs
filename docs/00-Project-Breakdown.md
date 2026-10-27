# VIP Guest Coordination System: Project Understanding (v2)

> **Version 2, revised 2026-10-12.** Supersedes `VIP Guest Coordination System Project Breakdown Doc.pdf` (v1) in the project root.
> This version applies the decisions made on 2026-10-12. A change log is at the end.
> The six core docs (`01`–`06`) expand this document into requirements, design and a build plan. Where they differ, this document governs **scope** and they govern **implementation detail**.

**What this is:** a web system that helps event coordinators manage VIP guests (ministers, executives, dignitaries and their teams) at large events. This is the updated version. It reflects the refinements made since the proposal was accepted: a guest intake link, live flight tracking, voice for the Co-Pilot, and a cleaning workflow triggered by check-out. It is a final-year Computer Science project, so every feature has to be buildable, testable and measurable.

## 1. The problem

At large VIP events, many things depend on each other: when a guest arrives, who picks them up, which room they get, and when that room is clean and ready. Today this is handled through spreadsheets, WhatsApp messages and phone calls, so information is scattered. When something changes (a flight is delayed, a guest cancels), someone has to update everything by hand.

Guest details also arrive in messy form. A typical message looks like this: *"Bishop is coming with 4 people. Landing on Emirates around 4 PM on Thursday. Needs a low-sugar diet."*

The system's job is to take messy, changing information and turn it into clear decisions, quickly.

## 2. Who uses it

The event coordinator is the main user. The whole system exists to help this person make decisions faster.

- **Event coordinator (main user):** sees everything on a dashboard and makes the final decisions.
- **Drivers:** have their own simple screen where they receive pickup assignments and changes.
- **Accommodation and logistics staff:** have their own simple screen where they see room allocations and arrivals, and mark guests as checked out.
- **Housekeeping and sanitation teams:** have their own simple screen showing which rooms need cleaning and in what order.
- **Guests and their assistants or secretariat:** fill in the intake form through a shared link. They do not log in or use the dashboard.

The driver, accommodation and housekeeping screens are kept minimal: a task list and a status button, nothing more.

The MVP also includes an **Admin**, a **Super Admin** and a **programs team**. The programs team is in charge of drafting the program/event flow and scheduling in general.

## 3. What the system does

It collects guest details through a shared link and uses AI to structure anything messy. It tracks flights live. It suggests rooms that fit each guest's needs, and the coordinator can edit them by hand when exceptions happen. It lets the coordinator ask questions by typing or speaking. When a guest checks out, it tells the cleaning team which room needs attention. The coordinator always makes the final call.

## 4. The five main parts

These five parts come from the accepted project proposal and are the backbone of the system. Some have been renamed or refined since.

1. **Guest Information Extraction & Validation Engine:** Guests or their assistants fill in an intake form through a shared link. The AI structures the free-text box (the "others" field, where they write anything they want us to know or any special needs) and any pasted messages. It flags anything missing or inconsistent for a human to check.
2. **Live Flight Tracking & Transport Coordination:** Tracks flights through a flight API. When a flight changes, it updates the arrival time, the affected pickups and the driver assignment, and notifies the people involved.
3. **Dynamic Constraint-Based Room Allocation:** Suggests rooms for the VIP and their entourage by weighing rules and preferences (capacity, floor, nearby rooms for a team, guest rank, room readiness). The coordinator can edit any allocation by hand for exceptions.
4. **Natural Language Co-Pilot:** A chat assistant connected to the live data. The coordinator can type or speak questions and requests in plain English.
5. **Room Turnaround & Cleaning:** When a guest is marked as checked out, the room is flagged for cleaning and the sanitation team is notified.

## 5. How the parts work together

All five parts read and write the same shared data: guests, flights, drivers and rooms. A change in one part flows into the others. Example: a guest's flight is delayed by 45 minutes.

1. The flight API reports the delay, and the guest's expected arrival time updates.
2. The system finds the pickup that is now affected and a driver who is free at the new time. The driver is notified on their screen.
3. Room allocation is re-checked if the new arrival time affects it.
4. The coordinator sees all of this on the dashboard and can ask the Co-Pilot, for example "who is affected?".

Later, when the accommodation team clicks "checked out" on that guest, the room is flagged and the sanitation team is notified.

Without shared data and this chain reaction, it would be five separate tools instead of one system. This is the most important thing for the design and database to get right.

## 6. What makes it "intelligent"

A normal app stores what you type. This system works things out and recommends what to do, and a human reviews the important decisions.

- **Guest Intake:** understands messy written language and notices when a submission is missing information or doesn't add up.
- **Flight and Transport:** works out the knock-on effects of a flight change instead of just saving a new time.
- **Room Allocation:** solves a puzzle with many rules instead of giving out the next free room, and warns when a manual choice breaks a rule.
- **Co-Pilot:** understands what the coordinator means, typed or spoken, and connects it to real system data.
- **Room Turnaround:** turns a checkout into the next action for the cleaning team and estimates when the room will be ready.

## 7. What gets built first (core MVP)

### 1. Guest Information Extraction & Validation

- Guests or their assistants fill in an intake form from one shared link: name, how they are arriving, the travel details for that arrival mode, team size, diet, and an "others" field for anything else. Each submission appears on the coordinator's dashboard.
- **"How are you arriving?"** is a required field with three options:
  - **Flying:** flight number, airline and arrival date are required.
  - **Own transport:** no driver is assigned, but the arrival date and time are still collected.
  - **Need pickup from my location:** the pickup address and pickup time are required.
- The AI structures the "others" field into clear items. The same AI also handles a message pasted in by hand, such as a forwarded WhatsApp message.
- If something is missing or doesn't add up, the submission is sent to the coordinator for review instead of being processed automatically.
- It uses a link and not a direct WhatsApp or phone connection, because that would give the system access to far more than guest messages, which is a privacy problem.
- The flight number is required for guests who are flying, because live flight tracking depends on it.
- **Measured by:** how many fields it extracts correctly, and how many real problems it catches.

### 2. Live Flight Tracking & Transport Coordination

- The system tracks each flying guest's flight through a flight API and shows whether it is scheduled, in the air, delayed or landed.
- When something changes, it updates the arrival time and finds which pickups are affected. It picks an available driver and notifies the people involved inside the system.
- A simulated mode that replays fake delays is included, so the logic can be tested and demonstrated reliably.
- It uses a fixed travel-time buffer, not live traffic prediction.
- **Measured by:** how quickly and correctly it reassigns after a change.
- Not all guests fly. Guests who choose **Own transport** get no driver. Guests who choose **Need pickup from my location** get a pickup at their address and time. Only **Flying** guests are tracked through the flight API.

### 3. Room Allocation

- The system suggests which rooms each guest gets. It has rules it must obey (the room is free, big enough and clean) and preferences it tries to meet (ground floor, rooms near each other for a team, guest rank).
- **Entourage and teams.** A VIP may come with backup singers, assistants, security personnel, representatives or other team members. The coordinator can record the entourage and assign accommodation to each member. Members do not have to stay in the VIP's room or get the same type of room, but proximity is considered so the entourage is not placed unnecessarily far from the VIP.
- The allocation rules stay the same for everyone: room capacity, floor, room proximity for members of the same team, guest rank/VIP category, and room readiness.
- **The coordinator, not the guest, sets each guest's VIP category/rank and team groupings.**
- The coordinator can edit any allocation by hand for exceptions. If a manual choice breaks a rule, the system warns first. Every manual change is recorded in a log.
- If someone cancels or is delayed, it reworks only the rooms not yet assigned. It never moves guests who have already checked in.
- **Measured by:** what share of the rules and preferences each allocation satisfies.

### 4. Co-Pilot (chat assistant, typed or spoken)

- The coordinator types or records a question on the move, such as "Which ministers land in the next 2 hours with no car assigned, or no room ready?", and gets an answer from the live data.
- For voice, the system shows the transcript first, because names and titles can be misheard.
- It can also do a small set of actions, such as moving a team to another wing. It always asks for confirmation first, and every action is recorded in a log. Questions that only read data can be answered straight away.
- **Measured by:** how often it answers correctly, and whether it picks the right action.

### 5. Room Turnaround & Cleaning

- When a guest leaves, the accommodation or logistics team clicks "checked out" on that guest. The room's status updates, and the sanitation team is notified that the room needs cleaning.
- Either team can mark the checkout, and the first confirmation wins. The second person sees "already checked out by X at <time>". The coordinator can reverse a mistaken checkout.
- A simple estimate of when each room will be free (expected checkout time plus cleaning time for that room type) is used to order the cleaning list by priority. There is no machine learning and no computer vision.
- **Measured by:** how reliably the status and notification flow works, and how close the estimates are to the actual ready times.

### One rule across all five: the system recommends and the coordinator decides

- **The system acts automatically only on easy-to-undo information updates:** creating a guest record from a clean submission, normalizing fields, updating arrival times from the flight API, and changing statuses.
- **The system proposes, and the coordinator approves with one tap,** for anything that commits resources or instructs people: room assignments, driver assignments, driver reassignment after a delay, and Co-Pilot write actions.
- **"High-confidence" is rule-based, not the AI's own score.** It means all required fields are present, all validation checks passed, there is no likely duplicate, and nothing was flagged in the "others" field.
- Likely duplicates are flagged for review, not auto-merged. Only exact matches are linked.
- Every automatic action is logged, and the coordinator can undo it.

## 8. Not in the first version (optional or future)

These are good ideas, but they are not needed for the core system. Do not build them now.

- **Live traffic prediction:** the first version uses a fixed travel-time buffer.
- **Real WhatsApp, SMS or email sending:** notifications inside the system are enough for now. Direct access to a phone or WhatsApp account is not planned, for privacy reasons.
- **Reading screenshots and PDFs** (such as a flight itinerary screenshot) in guest intake: a stretch goal.
- **Extra Co-Pilot actions** beyond the small agreed set (optional enhancement).

## 9. What the system is not

It is not a hotel booking system, a standalone flight tracker, a fleet-management platform, a general-purpose chatbot, a guest database with a dashboard, or a system that makes every decision by itself. Some of these features exist inside it, but none of them is the point.

## 10. Boundaries to keep the project realistic

- One event, one venue, one coordinating team.
- Guest and room data used for testing is made up (seeded or simulated). Flight tracking uses the real flight API, with a simulated mode for testing.
- Every important action needs human confirmation and is recorded in a log.
- Each part has a clear input, a clear output, and a way to measure how well it works.
- A part is finished when it works end to end and can be measured, not when it has the most features.

## A note on "predictive"

The accepted proposal used the word "predictive" for flights and for room turnaround. Flights are now tracked live through an API, so no prediction is needed there. For room cleaning, the checkout click is the main trigger. The forecast is a simple, explainable estimate (expected checkout time plus cleaning time by room type, with a delay buffer), not a trained model, because there is no real historical data to train one.

## Decisions log

1. **Cleaning:** trigger plus a simple estimated room-free time based on a fixed cleaning duration per room type.
2. **Intake link:** one shared link. The system automatically extracts, validates, normalizes and detects duplicates. High-confidence submissions (rule-based, see Section 7) are processed automatically. Unclear cases go to the coordinator for review.
3. **Check-out roles:** accommodation and logistics staff can both mark a guest as checked out, and the first confirmation wins. The system records who did it and when, and shows the second person who checked the guest out first. The coordinator can reverse a mistaken checkout. Drivers remain a separate role.
4. **Flight API:** AeroDataBox is recommended, with FlightAware AeroAPI as the fallback (see `02-TRD.md` §4.1). To be confirmed after a coverage test against the event's arrival airport(s).
5. **Data:** a combination of volunteer-generated data and synthetic/demo data. Volunteers can submit their information through the actual intake system. Synthetic data will be created to test specific scenarios such as duplicates, missing information, flight delays, room conflicts and different VIP categories.
6. **Venue:** the MVP is modelled around one hotel/venue with a fixed list of rooms.
7. **Arrival modes** *(2026-10-12)*: Flying / Own transport / Need pickup from my location, with conditional required fields (Section 7.1).
8. **Automation boundary** *(2026-10-12)*: automatic for easy-to-undo information updates. One-tap coordinator approval for anything that commits resources or instructs people (Section 7, "One rule across all five").
9. **Entourage** *(2026-10-12)*: entourage members get their own accommodation, placed near the VIP where possible. The coordinator sets VIP category/rank and team groupings. There is no "keep apart" rule.
10. **Roles** *(2026-10-12)*: Admin, Super Admin and the programs team are in the MVP.
11. **Tech stack** *(2026-10-12)*: see `02-TRD.md`.
12. **Hosting** *(2026-10-16)*: one DigitalOcean droplet runs the app and its own PostgreSQL (Docker Compose behind Caddy), instead of Vercel + Supabase. Auth moves to Better Auth, realtime to Postgres LISTEN/NOTIFY + Server-Sent Events, and scheduled jobs to a worker process. Roles are still enforced in the database with row-level security. See `02-TRD.md`.
13. **Hosting, revised** *(2026-10-27)*: production moves to **Vercel** (the Next.js app, London `lhr1`) and **Supabase** (managed Postgres only, London `eu-west-2`), both on free plans. The architecture from decision 12 stays: Better Auth, LISTEN/NOTIFY + Server-Sent Events and row-level security, with the worker's passes triggered by Supabase `pg_cron` over HTTP instead of a long-running process. The droplet files remain as an alternative. See `02-TRD.md` §5.2.

## Change log (v1 → v2)

| Section | Change |
|---|---|
| 2 | "Accommodation and protocol staff" renamed to "Accommodation and logistics staff". Admin, Super Admin and programs team moved from "plans" into the MVP. |
| 4.3 | Room allocation explicitly covers the VIP's entourage. |
| 6 | Room Turnaround no longer refers to an open decision about estimates. |
| 7.1 | Added the "How are you arriving?" field with conditional requirements. Completed the unfinished sentence about missing or inconsistent submissions. Flight number is required only for flying guests. |
| 7.2 | Deleted "(We could do a live prediction)". Rewrote the note about non-flying guests to match the arrival modes. |
| 7.3 | Removed "keeping certain guests apart". Added the entourage/team paragraph. The coordinator sets VIP category and team groupings. |
| 7.5 | Removed "Recommended addition, pending your decision" and "if the estimate is kept". Added the first-confirmation-wins checkout rule and coordinator reversal. |
| 7 (rule) | Replaced "(Or what do you think?)" with the automation boundary and the rule-based definition of high-confidence. |
| Predictive note | Removed "If a forecast is kept at all". |
| Decisions | Updated items 2–4 and added items 7–11. |
