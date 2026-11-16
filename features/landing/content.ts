// Words and figures for the landing page. Every result here comes from `pnpm eval:all`
// (eval/results/summary.md, run 11 Nov 2026 on a simulated event day); keep them in step.
import type { IconName } from '@/components/ui/Icon'

export interface Screenshot {
  readonly src: string
  readonly alt: string
  readonly width: number
  readonly height: number
}

export const SCREENSHOTS = {
  dashboard: {
    src: '/images/landing/dashboard.webp',
    alt: 'The Hostmark dashboard: VIP guests, arrivals, pickups and rooms for the day, with driver assignments waiting for approval.',
    width: 1600,
    height: 1000,
  },
  driverPhone: {
    src: '/images/landing/driver-phone.webp',
    alt: 'The driver app on a phone: the next pickup moved to 12:15 because flight ET512 is 40 minutes late.',
    width: 540,
    height: 1099,
  },
  registrationPhone: {
    src: '/images/landing/registration-phone.webp',
    alt: 'Guest registration on a phone: step 1 of 4, delegation details.',
    width: 540,
    height: 1099,
  },
  rooms: {
    src: '/images/landing/rooms.webp',
    alt: 'The rooms screen: every room by floor, coloured by whether it is free, occupied or being cleaned.',
    width: 1440,
    height: 900,
  },
  askVictoria: {
    src: '/images/landing/ask-victoria.webp',
    alt: 'Ask Victoria answering "Who is arriving today without a driver?" with the two guests, linked to their profiles.',
    width: 1440,
    height: 900,
  },
} as const satisfies Record<string, Screenshot>

export interface Point {
  readonly icon: IconName
  readonly title: string
  readonly text: string
}

export const PROBLEMS: readonly Point[] = [
  {
    icon: 'plane',
    title: 'A flight lands late',
    text: 'The driver is already at the airport, the welcome briefing starts without the guest, and nobody told the hotel.',
  },
  {
    icon: 'message',
    title: 'Details live in chat threads',
    text: 'Arrival times, dietary needs and room preferences are spread across WhatsApp, email and three spreadsheets.',
  },
  {
    icon: 'activity',
    title: 'Nobody knows who changed what',
    text: 'A room was swapped, a pickup moved. When it goes wrong there is no record, and no way back.',
  },
]

export interface CascadeStep {
  readonly time: string
  readonly title: string
  readonly text: string
}

export const CASCADE_STEPS: readonly CascadeStep[] = [
  { time: '11:02', title: 'Flight ET512 is 40 minutes late', text: 'Hostmark picks up the new landing time from the flight data.' },
  { time: '11:02', title: 'The pickup moves to 12:15', text: 'The driver’s phone shows the new time and asks them to confirm.' },
  { time: '11:02', title: 'Clashes are checked', text: 'If the driver now has two pickups at once, a better-placed driver is suggested.' },
  { time: '11:03', title: 'A coordinator approves', text: 'One tap on the dashboard. Nothing changes for the guest until a person says yes.' },
]

export interface Module {
  /** Places the tile in the grid (styles/20-landing.css, .lp-tile--<slug>). */
  readonly slug: 'registration' | 'arrivals' | 'transport' | 'rooms' | 'programme' | 'victoria'
  readonly icon: IconName
  readonly title: string
  readonly text: string
  readonly shot?: Screenshot
}

export const MODULES: readonly Module[] = [
  {
    slug: 'registration',
    icon: 'inbox',
    title: 'Registration and intake',
    text: 'One link for every delegation, on any phone. Pasted messages are read into the same form, and duplicates are caught.',
  },
  { slug: 'arrivals', icon: 'plane', title: 'Arrivals', text: 'The day by the hour: who lands when, live flight status, and who still needs a driver.' },
  { slug: 'transport', icon: 'car', title: 'Transport and the driver app', text: 'Suggested drivers for every pickup, and a phone app that tells drivers the moment a time changes.' },
  {
    slug: 'rooms',
    icon: 'bed',
    title: 'Rooms, front desk and housekeeping',
    text: 'A room plan that respects rank, access needs and preferences. A check-out reaches housekeeping straight away.',
    shot: SCREENSHOTS.rooms,
  },
  { slug: 'programme', icon: 'calendar', title: 'Programme', text: 'Sessions, venues and who should be there, with the items at risk when a VIP is running late.' },
  {
    slug: 'victoria',
    icon: 'sparkle',
    title: 'Ask Victoria',
    text: 'Ask in plain words or by voice: “Who is arriving today without a driver?” Answers use live data; changes wait for approval.',
    shot: SCREENSHOTS.askVictoria,
  },
]

export interface Result {
  readonly value: string
  readonly label: string
  readonly detail: string
}

export const RESULTS: readonly Result[] = [
  { value: '14 ms', label: 'to re-plan after a flight change', detail: '95th percentile, against a target of 5 seconds' },
  { value: '64 of 64', label: 'suggested changes were workable', detail: 'when they were proposed to a coordinator' },
  { value: '100%', label: 'of the hard room rules kept', detail: 'rank, accessibility and rooms out of service' },
  { value: '+30 pts', label: 'more guest room preferences met', detail: '76–84% of preferences, against 46–51% for first-free-room' },
]

export const RESULTS_SOURCE =
  'Measured with the built-in evaluations on a simulated event day of 30 flights, 48 pickups and 150 flight changes, run on 11 Nov 2026.'

export const SAFEGUARDS: readonly Point[] = [
  { icon: 'check', title: 'People approve, the system suggests', text: 'Room plans, driver swaps and re-timed pickups wait for a coordinator’s yes.' },
  { icon: 'activity', title: 'Every change is recorded', text: 'Who did what and when, with undo for the changes that allow it.' },
  { icon: 'shield', title: 'Each role sees its part', text: 'Drivers see their pickups, housekeeping sees rooms. The database itself enforces it.' },
  { icon: 'users', title: 'Each event kept apart', text: 'Run several events at once; each team sees only its own guests and data.' },
]

export const ROLES: readonly string[] = [
  'Programme managers',
  'Coordinators',
  'Admins',
  'Programme team',
  'Front desk',
  'Drivers',
  'Housekeeping',
]
