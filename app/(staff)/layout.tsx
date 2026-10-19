// Phone-sized staff app (driver, front desk, housekeeping). Coordinators may open the front desk.
import type { ReactNode } from 'react'
import { StaffShell } from '@/components/shell/StaffShell'
import { requirePageSession, toSessionValue } from '@/lib/auth/page-guard'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'

const STAFF_APP_ROLES = ['driver', 'accommodation', 'housekeeping', ...COORDINATOR_PLUS] as const

export default async function StaffLayout({ children }: { readonly children: ReactNode }) {
  const session = await requirePageSession(STAFF_APP_ROLES)
  return <StaffShell session={toSessionValue(session)}>{children}</StaffShell>
}
