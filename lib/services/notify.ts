// Notification fan-out from server work (vip_system only): to every coordinator, admin and super
// admin, or to specific accounts (e.g. the drivers on a trip). Each insert wakes the live stream.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'

const COORDINATOR_ROLES: readonly string[] = ['coordinator', 'admin', 'super_admin']

export interface Notice {
  readonly kind: string
  readonly title: string
  readonly body?: string | null
  readonly priority?: 'normal' | 'high'
  /** What the notification opens, when it is about one record. */
  readonly entity_type?: string | null
  readonly entity_id?: string | null
}

export async function notifyCoordinators(tx: Tx, notice: Notice): Promise<void> {
  await sql`select private.notify_roles(
    ${COORDINATOR_ROLES}::public.app_role[],
    ${notice.kind}, ${notice.title}, ${notice.body ?? null}, ${notice.priority ?? 'normal'},
    ${notice.entity_type ?? null}, ${notice.entity_id ?? null}::uuid
  )`.execute(tx)
}

/** Accounts without a login (null ids) are skipped by private.notify_users. */
export async function notifyUsers(tx: Tx, profileIds: readonly (string | null)[], notice: Notice): Promise<void> {
  const ids = profileIds.filter((id): id is string => id !== null)
  if (ids.length === 0) return
  await sql`select private.notify_users(
    ${ids}::uuid[],
    ${notice.kind}, ${notice.title}, ${notice.body ?? null}, ${notice.priority ?? 'normal'},
    ${notice.entity_type ?? null}, ${notice.entity_id ?? null}::uuid
  )`.execute(tx)
}
