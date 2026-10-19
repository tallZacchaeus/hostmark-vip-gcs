// Counters for the coordinator dashboard ("At a glance" and the KPI tiles). Each phase adds its
// own counters here; all run as the signed-in user, so row-level security applies.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'

export interface RoomCounts {
  readonly total: number
  readonly ready: number
  readonly needs_cleaning: number
  readonly cleaning: number
  readonly out_of_service: number
}

export interface DashboardSummary {
  readonly rooms: RoomCounts
  readonly decisions_pending: number
}

export async function countRooms(tx: Tx): Promise<RoomCounts> {
  const row = await tx
    .selectFrom('rooms')
    .select([
      sql<number>`count(*)::int`.as('total'),
      sql<number>`(count(*) filter (where housekeeping_status = 'clean' and not out_of_service))::int`.as('ready'),
      sql<number>`(count(*) filter (where housekeeping_status = 'needs_cleaning' and not out_of_service))::int`.as('needs_cleaning'),
      sql<number>`(count(*) filter (where housekeeping_status = 'cleaning' and not out_of_service))::int`.as('cleaning'),
      sql<number>`(count(*) filter (where out_of_service))::int`.as('out_of_service'),
    ])
    .executeTakeFirstOrThrow()
  return row
}

/** Open top-level proposals that have not expired (the same rule as the decisions queue). */
export async function countPendingDecisions(tx: Tx): Promise<number> {
  const row = await tx
    .selectFrom('proposals')
    .where('status', '=', 'pending')
    .where('parent_id', 'is', null)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', sql<Date>`now()`)]))
    .select(sql<number>`count(*)::int`.as('n'))
    .executeTakeFirstOrThrow()
  return row.n
}

export async function readDashboardSummary(tx: Tx): Promise<DashboardSummary> {
  const [rooms, decisions] = await Promise.all([countRooms(tx), countPendingDecisions(tx)])
  return { rooms, decisions_pending: decisions }
}
