// Which roles may open which screen (03-App-Flow.md section 2). Pages check this on the server
// before rendering, and the sidebar uses it to hide what a role cannot open. The API and
// row-level security still decide what data each role gets; this only shapes navigation.
import { type AppRole, COORDINATOR_PLUS, hasAnyRole } from './roles'

export const PAGE_KEYS = [
  'dashboard',
  'programme',
  'guests',
  'intake',
  'arrivals',
  'transport',
  'rooms',
  'sanitation',
  'activity',
  'simulation',
  'settings',
  'driver',
  'frontDesk',
  'staffSanitation',
] as const

export type PageKey = (typeof PAGE_KEYS)[number]

export const PAGE_PATHS: Readonly<Record<PageKey, string>> = {
  dashboard: '/dashboard',
  programme: '/programme',
  guests: '/guests',
  intake: '/intake',
  arrivals: '/arrivals',
  transport: '/transport',
  rooms: '/rooms',
  sanitation: '/sanitation',
  activity: '/activity',
  simulation: '/simulation',
  settings: '/settings',
  driver: '/driver',
  frontDesk: '/staff/front-desk',
  staffSanitation: '/staff/sanitation',
}

export const PAGE_ACCESS: Readonly<Record<PageKey, readonly AppRole[]>> = {
  dashboard: COORDINATOR_PLUS,
  programme: [...COORDINATOR_PLUS, 'programs'],
  guests: COORDINATOR_PLUS,
  intake: COORDINATOR_PLUS,
  arrivals: COORDINATOR_PLUS,
  transport: COORDINATOR_PLUS,
  rooms: COORDINATOR_PLUS,
  sanitation: COORDINATOR_PLUS,
  activity: COORDINATOR_PLUS,
  simulation: COORDINATOR_PLUS,
  // Coordinators manage VIP categories; the other tabs are Admin-only (SETTINGS_TAB_ACCESS).
  settings: COORDINATOR_PLUS,
  driver: ['driver'],
  // Checkout is open to accommodation staff and the coordinator (FR-CL-01).
  frontDesk: ['accommodation', ...COORDINATOR_PLUS],
  staffSanitation: ['housekeeping'],
}

export const SETTINGS_TABS = ['users', 'rooms', 'drivers', 'categories', 'system'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export const SETTINGS_TAB_ACCESS: Readonly<Record<SettingsTab, readonly AppRole[]>> = {
  users: ['super_admin', 'admin'],
  rooms: ['super_admin', 'admin'],
  drivers: ['super_admin', 'admin'],
  categories: COORDINATOR_PLUS,
  system: ['super_admin', 'admin'],
}

export function canOpenPage(role: AppRole, page: PageKey): boolean {
  return hasAnyRole(role, PAGE_ACCESS[page])
}

export function settingsTabsFor(role: AppRole): SettingsTab[] {
  return SETTINGS_TABS.filter((tab) => hasAnyRole(role, SETTINGS_TAB_ACCESS[tab]))
}

/** Roles that use the console (sidebar + top bar) rather than the phone-sized staff app. */
export const CONSOLE_ROLES: readonly AppRole[] = [...COORDINATOR_PLUS, 'programs']
