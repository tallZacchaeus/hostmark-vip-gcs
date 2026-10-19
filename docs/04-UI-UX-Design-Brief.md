# 04 — UI/UX Design Brief

**Status:** Draft v1, 2026-10-12. Design direction only; no screens built yet.

**Related:** screens and flows in [`03-App-Flow.md`](03-App-Flow.md); components are built on shadcn/ui ([`02-TRD.md`](02-TRD.md)).

> **Brand:** no brand guidelines were supplied. The palette below is a neutral, accessible default. If the client (or Clintels) has brand colors, swap the `--accent` tokens. The status colors should stay as they are, because they carry meaning.

---

## 1. Design direction

**"Calm control room."** The coordinator works under time pressure, with many moving parts and VIP stakes. The interface should feel composed and dense with information, never noisy. Three ideas drive every screen:

1. **Decisions first.** The most prominent thing on the console is always *what needs a human decision now*. Everything else is context for those decisions.
2. **Show what the system did vs. what it suggests vs. what is fact.** Every piece of data is visibly one of:
   - **Committed fact:** normal styling.
   - **Automatic change:** a small "auto" marker with an inline **Undo** for a short period and in the Activity log.
   - **Proposal (awaiting you):** violet "Suggested" styling with **Approve / Reject** and a "Why?" disclosure.

   This visual grammar is the main trust mechanism. Use it everywhere.
3. **One glance, one tap** on staff screens. Each task card answers *what, where, when*, and has one obvious button.

**Tone:** respectful and precise. Always show honorifics ("H.E.", "Bishop", "Hon.") as the coordinator entered them. Use plain verbs on buttons ("Approve", "Check out", "Start cleaning"). No jokes, no exclamation marks.

## 2. Color

All colors are CSS custom properties defined on `:root` and overridden for dark mode. Contrast ratios below were computed against the listed backgrounds. **All text tokens meet WCAG AA (≥ 4.5:1).**

### 2.1 Base tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0E1420` | Page background |
| `--surface-muted` | `#F6F7F9` | `#161D2B` | Panels, table stripes, sidebar |
| `--border` | `#E3E7EE` | `#263042` | Dividers, inputs |
| `--ink` | `#0F172A` (17.9:1) | `#E6EAF2` (15.3:1) | Primary text |
| `--ink-muted` | `#475569` (7.6:1) | `#9AA4B5` (7.3:1) | Secondary text, labels |
| `--accent` | `#0F766E` (5.5:1) | `#2DD4BF` (9.9:1) | Primary buttons, links, focus ring, active nav. Text on accent: white (light) / `#0E1420` (dark) |

### 2.2 Status tokens (semantic — do not repurpose)

| Token | Light | Dark | Meaning | Used for |
|---|---|---|---|---|
| `--ok` | `#15803D` (5.0:1) | `#4ADE80` | Good / ready / done | Landed, room ready, pickup completed, cleaning done |
| `--warn` | `#B45309` (5.0:1) | `#FBBF24` | Attention / at risk | Delayed, program at risk, room not ready by arrival, needs review |
| `--danger` | `#B91C1C` (6.5:1) | `#F87171` | Problem / blocked | Cancelled, diverted, hard-rule violation, no driver available |
| `--info` | `#1D4ED8` (6.7:1) | `#60A5FA` | In progress | In the air, en route, cleaning in progress |
| `--neutral` | `#475569` (7.6:1) | `#94A3B8` | Not started | Scheduled, queued, planned |
| `--proposal` | `#6D28D9` (7.1:1) | `#A78BFA` | **System suggestion awaiting a decision** | Proposal cards, "Suggested" badges, Co-Pilot action cards |
| `--sim` | `#B45309` bg tint + striped border | same | **Simulated mode** | Global banner whenever `flight_mode = simulated` or a simulation run is active |

Rules:
- **Never use color alone.** Every status has an icon and a text label as well (e.g. ⏱ "Delayed +45 min", ✓ "Ready").
- Status badges use a tinted background (≈10% of the status color) with the full-strength color for text and icon.
- Red is reserved for real problems. A delay is amber, not red.

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| UI text | **Geist Sans** (fallback: system-ui) | Neutral and highly legible at small sizes. Ships easily with Next.js (`next/font`). |
| Data | **Geist Mono**, or Geist Sans with `font-variant-numeric: tabular-nums` | Flight numbers (`EK783`), times (`14:05`), room numbers (`412`). Aligned columns make tables scannable. |

**Scale (rem, 16px base):** 0.75 (meta) · 0.875 (table/body-dense) · 1 (body) · 1.125 (card titles) · 1.25 (section) · 1.5 (page title) · 2 (dashboard counters).

**Weights:** 400 body, 500 labels/buttons, 600 titles. Avoid 700+ except for counters.

**Times:** 24-hour clock in the event timezone (e.g. `14:05`), with relative time where useful ("in 35 min", "12 min ago"). The event clock is always visible in the console top bar.

## 4. Layout conventions

### Console (desktop/tablet)
- **Sidebar** (collapsible): Dashboard, Decisions *(badge count)*, Guests, Intake review *(badge)*, Flights, Transport, Rooms, Housekeeping, Program, Activity, Simulation, Admin.
- **Top bar:** event name · **event clock** · simulated-mode banner (full width, above the top bar, when active) · notifications bell · **Co-Pilot** button (keyboard: `/` or `Ctrl/⌘ K`).
- **Dashboard grid:** left column (≈ 40%) = **Needs your decision** queue; right column = **Next 6 hours** arrivals timeline + alerts; counters strip on top.
- **Tables** (TanStack): sticky headers, dense rows (36–40 px), column filters, saved filter chips, row → detail drawer (keeps the user in context) with "Open full page" for complex records.
- **Detail pages:** a header with name + honorific + VIP category chip + status, then tabs or sections: Overview · Members · Travel · Rooms · Program · History.
- **Breakpoints:** ≥ 1280 full layout; 768–1279 the sidebar collapses to icons and the dashboard stacks; < 768 the console is usable for the Co-Pilot, decisions and lookups, while heavy editing (room grid) shows a "best on a larger screen" hint.

### Staff app (phone)
- A single list of task cards, next task first. A sticky header shows the role, connection status and simulated-mode banner if active.
- **Card:** primary line (time + place), secondary line (guest title/name or room/floor), status badge, **one full-width button** (min height 48 px) at the bottom of the card.
- **Changes:** a changed card moves to the top with an amber "Changed" ribbon and an **Acknowledge** button. The previous value is shown struck through ("~~14:05~~ 14:50").
- **Notifications:** in-app banner + short sound + vibration (where supported) on new or changed tasks.
- Works on low-end Android: no heavy animation, and lists are server-rendered first.

### Public intake form (phone-first)
- One column, max-width 560 px, generous spacing. The event name is at the top with a one-line purpose statement.
- **"How are you arriving?"** comes first as three large radio cards with icons (✈ Flying / 🚗 Own transport / 📍 Need pickup). Only the relevant fields appear after it.
- Team members are a repeatable "Add person" row (name + role select).
- Inline validation on blur, with plain-language errors ("Flight numbers look like EK783").
- The confirmation page shows the **reference code** large, plus what happens next and a contact line.
- Target: completed in under 3 minutes on a phone.

## 5. Key components

| Component | Description |
|---|---|
| **StatusBadge** | Icon + label + tinted background, from the status tokens. Variants for every enum in `05` §2. |
| **ProposalCard** | Violet left border + "Suggested" tag; title ("Reassign EK783 pickup → Driver B"); one-line reason; **Why?** disclosure (rules met/missed, alternatives, triggering change); **Approve** (primary) · **Reject** · **Edit**. Shows "Superseded"/"Expired" states. |
| **DecisionQueue** | List of ProposalCards + ReviewItems, grouped by urgency (time to impact). Keyboard: `j/k` move, `a` approve, `r` reject. |
| **ArrivalTimeline** | Horizontal timeline (next 6 h): one row per arrival; markers for ETA, pickup time and room-ready time. Delays render as a shifted marker with a ghost at the original time. |
| **FlightChip** | `EK783 · In the air · ETA 14:50 (+45)` with phase icon. |
| **RoomGrid** | Floors as rows × wings as column groups. Each cell: room number, status color strip, occupant initials or delegation tag, readiness icon. Delegation highlight on hover shows proximity. Click to open the room drawer; drag a guest to a cell → rule check → warning dialog if needed. |
| **RuleWarningDialog** | Lists hard-rule violations (danger) and preference losses (warn) for a manual change. Requires a reason to "Assign anyway". |
| **ScoreBreakdown** | For plan lines: per-rule ✓/✗ with weights, overall %. |
| **AutoChangeMarker + UndoToast** | Small "auto" chip on values set by the system. A toast with Undo appears for 10 s after automatic changes the coordinator triggered; long-term undo lives in Activity. |
| **CoPilotDrawer** | Chat transcript; answers render guest/flight/room references as links/chips; inline ProposalCards; **push-to-talk mic** (hold, or tap to start/stop) → transcript lands in the input, editable, never auto-sent. |
| **StaffTaskCard** | As described in §4. |
| **SimBanner** | Full-width striped amber banner: "SIMULATED MODE · virtual time 14:20 · ×60 · Stop". |
| **EmptyState** | Every list has a purposeful empty state ("No decisions waiting. New proposals appear here automatically."). |

## 6. Interaction patterns

- **Optimistic but honest:** staff button taps update immediately and show a spinner chip until the server confirms. On conflict (e.g. already checked out), the card shows the server's truth with who and when.
- **Realtime updates** never move content under the user's cursor. New items slide in with a "3 new" pill to reveal them when the list is scrolled.
- **Confirmations** only for consequential actions (reverse checkout, assign anyway, reject plan, undo). One-tap approve has no extra confirm dialog. Undo is the safety net.
- **Forms** keep inputs on error, focus the first invalid field, and never clear typed data.
- **Motion:** 150–200 ms ease-out for drawers and toasts only. Respect `prefers-reduced-motion`.

## 7. Accessibility (WCAG 2.2 AA)

- Contrast meets AA for all text tokens (§2). Focus ring: 2 px `--accent` + 2 px offset, always visible on keyboard focus.
- Full keyboard operation of the console. The room grid has a list-view alternative for screen readers and keyboard users.
- Realtime announcements via `aria-live="polite"` (new decision, task changed). `assertive` only for blocking errors.
- Touch targets ≥ 44 × 44 px (console) and ≥ 48 px high buttons (staff app, intake form).
- Status is never conveyed by color alone (§2.2). Icons have text labels.
- Forms: visible labels (no placeholder-only labels), errors linked via `aria-describedby`, and required fields marked in text.
- Voice is never the only input: every Co-Pilot capability works by typing.
- Language: plain English; the event/venue can add translations later (copy is kept in one dictionary file).

## 8. Content & privacy in the UI

- Housekeeping screens show **room data only** (no guest names).
- Driver screens show only the driver's own jobs.
- Show the VIP category as a chip ("Cat. 1") rather than an explicit rank word on staff screens.
- The confirmation page and intake form never echo other people's data.

## 9. Open design questions

1. Client/brand colors and logo (Clintels or the event's own branding)?
2. Do staff screens need a local language option for the MVP?
3. Should the console default to light, dark, or follow the system setting? (Recommended: follow the system setting.)
