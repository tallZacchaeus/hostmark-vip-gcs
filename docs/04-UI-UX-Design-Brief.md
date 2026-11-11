# 04 — UI/UX Design Brief

**Status:** v2, 2026-10-19. The visual design is now the **Figma Make design "Hostmark"** ([`design/figma-make/`](../design/figma-make/README.md)), ported into the Next.js app. Where this brief and the Figma design differ, the design decides look and flow and the PRD decides rules (decision of 2026-10-19).

**Related:** screens and flows in [`03-App-Flow.md`](03-App-Flow.md); components in `components/ui` and `components/shell`; styles in `styles/` ([`02-TRD.md`](02-TRD.md) §1).

> **Brand:** **Hostmark** (logo mark `public/hostmark-logo-C.svg`, wordmark "**Host**mark" with the second half in orange). The design is light-only; dark mode is not part of it.

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

Taken from the design's stylesheet (`styles/01-base.css` and the per-screen files). Contrast ratios were measured on the backgrounds they are used on; **every text colour meets WCAG AA (≥ 4.5:1)**. The design's tertiary grey (`#6b7587`, 4.30:1 on the page background) was darkened to `#626d80` (≥ 4.62:1 on all light backgrounds) for that reason.

### 2.1 Base

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--navy` | `#0e1a2c` | Sidebar, staff app headers, avatar | sidebar text `#c8d0de` 11.3:1, muted `#8794ab` 5.7:1 |
| `--text` | `#0f1b2d` | Primary text | 17.3:1 on white, 16.0:1 on the page |
| `--secondary` | `#566174` | Secondary text, labels | 6.3:1 / 5.8:1 |
| `--tertiary` | `#626d80` | Helper text, timestamps | 4.8:1 on the page |
| `--line` | `#e6eaf2` | Borders, dividers | — |
| page background | `#f4f6fb` | Console background | — |
| `--orange` (accent) | `#c8420f`, gradient `#d5440e → #b3300a` | Primary buttons, active nav marker, links (`#b83a0a`) | white on accent 4.95:1–6.3:1 |
| focus ring | `#e8480c` 2 px, 2 px offset (`#2456b3` on some screens) | Keyboard focus | — |

### 2.2 Status (semantic — do not repurpose)

| Meaning | Text on tint | Contrast | Used for |
|---|---|---|---|
| Success / ready / done | `#146c36` on `#e4f6ec` | 5.8:1 | Landed, room ready, checked in, active account |
| Warning / at risk | `#a84f08` on `#fff1da` | 5.0:1 | Delayed, needs review, programme at risk, invited account |
| Error / blocked | `#b42318` on `#fdecea` | 5.8:1 | Cancelled, rule broken, no driver |
| Info / in progress | `#2456b3` on `#e8f0ff` | 6.0:1 | In the air, in progress, cleaning |
| Neutral / not started | `#566174` on `#eef1f6` | 5.5:1 | Scheduled, queued, deactivated |
| **Suggested** (awaiting a decision) | `#6d3fc4` on `#f0eaff`, ✦ icon | 5.7:1 | Proposals, "Suggested" chips, Co-Pilot action cards |
| **Simulated mode** | `#a84f08` on `#fff7e8`, dashed border | 5.2:1 | Top-bar "Simulated" badge and staff-app strip (FR-PL-10) |

Rules (unchanged): **never colour alone** (every status has a text label and usually an icon); red only for real problems (a delay is amber); status pills are tinted backgrounds with full-strength text.

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| UI text | **Plus Jakarta Sans** (variable, self-hosted via `@fontsource-variable/plus-jakarta-sans`; fallback system-ui) | The design's typeface. Self-hosted, so no request goes to Google Fonts. |
| Data | `ui-monospace, SFMono-Regular, Menlo` for references and flight numbers (`VIP-7K3Q`, `EK783`) | Times use tabular numbers. |

Page titles are 34 px / 800; card titles 15–20 px / 700–800; body 14 px; helper text 11–13 px. **Times:** 24-hour clock in the event time zone (`lib/client/format.ts`), with the event clock in the console top bar and sidebar.

## 4. Layout conventions

### Console (desktop/tablet)
- **Sidebar** (collapses to a drawer below 1100 px): Dashboard, Programme, Guests, Intake *(count)*, Arrivals, Transport, Rooms, Sanitation · Activity, Simulation, Settings; event card and signed-in user at the bottom. Items a role cannot open are hidden.
- **Top bar:** search · event name · **Simulated** badge (when active) · event clock · **Ask Victoria** (the Co-Pilot assistant, named Victoria on screen since 2026-11-10) · notifications bell · account menu (change password, sign out).
- **Dashboard:** greeting hero with the venue photo, KPI tiles, then **Waiting for your approval** (left) and recent activity / at a glance (right), quick actions at the bottom.
- **Tables:** the design's grid rows (guests, intake, settings) and plain `data-table`s for admin lists; filters sit above the table and the row opens the detail page.
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
- **Save buttons stay pressable** in dialogs with required fields. Pressing one with something missing lists what is still needed ("Enter a venue") instead of leaving a greyed-out button with no reason (`FormDialog` `missing`; tester feedback, Nov 2026). Only confirmations and no-change states stay disabled.
- **Dialogs never outgrow the screen:** at most the screen height less 40 px and no wider than the screen; the fields scroll inside and the button bar stays pinned to the bottom.
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

## 9. Design decisions (2026-10-19)

1. **Brand:** Hostmark, from the Figma design.
2. **Staff screens language:** English only for the MVP (copy kept in components; a dictionary can be added later).
3. **Theme:** light only, as designed. The design has no dark mode.
4. **Design-review toggles** ("Preview: Default / Loading / Empty / Error") from the prototype were removed: those states now come from real data.
5. **Images:** the Lagos skyline photo (Unsplash licence) and the font are served from this app, not hotlinked.
