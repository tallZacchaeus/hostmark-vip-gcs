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

/**
 * For alerts that the same situation raises again and again (a pickup that still has no free
 * driver after every flight update or worker pass): skipped while the same alert about the same
 * record is still unread, so coordinators are told once; after it is read, a new one is sent.
 * Call it as vip_system (like everything in this file): under a staff login, row-level security
 * would hide other people's notifications and the check would miss them.
 */
export async function notifyCoordinatorsOnce(tx: Tx, notice: Notice): Promise<void> {
  const { rows } = await sql<{ open: boolean }>`
    select exists (
      select 1 from public.notifications
      where kind = ${notice.kind} and title = ${notice.title} and read_at is null
        and entity_id is not distinct from ${notice.entity_id ?? null}::uuid
    ) as open`.execute(tx)
  if (rows[0]?.open) return
  await notifyCoordinators(tx, notice)
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
