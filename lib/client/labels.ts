// Human labels and deep links shared by the console and staff screens.
import { PAGE_KEYS, PAGE_PATHS, canOpenPage } from '@/lib/auth/page-access'
import type { AppRole } from '@/lib/auth/roles'

export const ROLE_LABELS: Readonly<Record<AppRole, string>> = {
  super_admin: 'Super Admin',
  programme_manager: 'Programme Manager',
  admin: 'Admin',
  coordinator: 'Event Coordinator',
  programs: 'Programmes team',
  driver: 'Driver',
  accommodation: 'Front desk',
  housekeeping: 'Housekeeping',
}

/** Roles in the order an admin usually assigns them. */
export const ASSIGNABLE_ROLES: readonly AppRole[] = [
  'coordinator',
  'admin',
  'programme_manager',
  'programs',
  'driver',
  'accommodation',
  'housekeeping',
  'super_admin',
]

const STAFF_LINKS: Partial<Record<AppRole, Readonly<Record<string, string>>>> = {
  driver: { pickups: '/driver', pickup_assignments: '/driver' },
  housekeeping: { cleaning_tasks: '/staff/sanitation', rooms: '/staff/sanitation' },
  accommodation: { room_assignments: '/staff/front-desk', guests: '/staff/front-desk', rooms: '/staff/front-desk' },
}

/** True when `href` leads to a screen this role may open (the longest matching page path wins). */
function canFollow(role: AppRole, href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? href
  const page = PAGE_KEYS.filter((key) => path === PAGE_PATHS[key] || path.startsWith(`${PAGE_PATHS[key]}/`)).sort(
    (a, b) => PAGE_PATHS[b].length - PAGE_PATHS[a].length,
  )[0]
  return page !== undefined && canOpenPage(role, page)
}

/**
 * Where a notification about `entityType` should take this role (03-App-Flow.md "Deep links"), or
 * null when the role has no screen for it (the notification is then read in place).
 */
export function entityHref(role: AppRole, entityType: string | null, entityId: string | null): string | null {
  if (!entityType) return null
  const staff = STAFF_LINKS[role]?.[entityType]
  if (staff) return staff
  const href = consoleHref(entityType, entityId)
  return href && canFollow(role, href) ? href : null
}

function consoleHref(entityType: string, entityId: string | null): string | null {
  switch (entityType) {
    case 'proposals':
      return '/dashboard#approvals'
    case 'intake_submissions':
      return entityId ? `/intake/${entityId}` : '/intake'
    case 'guests':
    case 'delegations':
      return entityId ? `/guests/${entityId}` : '/guests'
    case 'flights':
    case 'arrivals':
      return '/arrivals'
    case 'pickups':
    case 'pickup_assignments':
      return '/transport'
    case 'rooms':
    case 'room_assignments':
      return '/rooms'
    case 'cleaning_tasks':
      return '/sanitation'
    case 'program_items':
      return '/programme'
    default:
      return null
  }
}
