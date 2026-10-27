// Staff roles and the rules that compare them. The database enforces the same rules with
// row-level security (db/migrations); these helpers give the API clear, early 403s.

export const APP_ROLES = [
  'super_admin',
  'admin',
  'coordinator',
  'programs',
  'driver',
  'accommodation',
  'housekeeping',
] as const

export type AppRole = (typeof APP_ROLES)[number]

/** Roles that manage accounts, venue and drivers. */
export const ADMIN_PLUS: readonly AppRole[] = ['super_admin', 'admin']

/** Roles with the full operational view (01-PRD.md: super_admin ⊇ admin ⊇ coordinator). */
export const COORDINATOR_PLUS: readonly AppRole[] = ['super_admin', 'admin', 'coordinator']

export const ANY_ROLE: readonly AppRole[] = APP_ROLES

/** The front desk app: accommodation staff, and coordinators who step in (FR-RA-09, FR-CL-01). */
export const FRONT_DESK_ROLES: readonly AppRole[] = ['accommodation', ...COORDINATOR_PLUS]

/** Start → Done on cleaning tasks (FR-CL-05); coordinators may step in. */
export const HOUSEKEEPING_ROLES: readonly AppRole[] = ['housekeeping', ...COORDINATOR_PLUS]

/** The cleaning queue (rooms only, no guest identities): housekeeping, the front desk and coordinators. */
export const CLEANING_READERS: readonly AppRole[] = ['housekeeping', 'accommodation', ...COORDINATOR_PLUS]

/** The programme: the programs team and Admin draft and publish (FR-PG-01). */
export const PROGRAM_EDITORS: readonly AppRole[] = ['super_admin', 'admin', 'programs']

/** The programme timeline: coordinators see what is published (FR-PG-04). */
export const PROGRAM_READERS: readonly AppRole[] = [...COORDINATOR_PLUS, 'programs']

/** Guests and arrivals are read by the programmes team and the front desk too (P2 migration RLS). */
export const GUEST_READERS: readonly AppRole[] = [...COORDINATOR_PLUS, 'programs', 'accommodation']

/** Where each role lands after signing in (03-App-Flow.md section 3; paths follow the Figma design). */
export const HOME_ROUTES: Readonly<Record<AppRole, string>> = {
  super_admin: '/dashboard',
  admin: '/dashboard',
  coordinator: '/dashboard',
  programs: '/programme',
  driver: '/driver',
  accommodation: '/staff/front-desk',
  housekeeping: '/staff/sanitation',
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value)
}

export function hasAnyRole(role: AppRole, allowed: readonly AppRole[]): boolean {
  return allowed.includes(role)
}

/**
 * Whether `actorRole` may create, edit or deactivate an account holding `targetRole`.
 * Super Admin manages everyone; Admin manages only roles below Admin.
 */
export function canManageAccount(actorRole: AppRole, targetRole: AppRole): boolean {
  if (actorRole === 'super_admin') {
    return true
  }
  return actorRole === 'admin' && !ADMIN_PLUS.includes(targetRole)
}
