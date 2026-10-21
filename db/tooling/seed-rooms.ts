// Rooms demo data (P4) on top of the seeded guests: a few rooms waiting for or under cleaning and
// one out of service, so the grid shows every state, then the real allocator drafts a plan for
// every guest. The plan is left pending for the coordinator to review on /rooms/plan.
import { type Kysely, sql } from 'kysely'
import type { DB } from '@/lib/db/types'
import { runAllocation } from '@/lib/services/rooms/plan'

const NEEDS_CLEANING = ['108', '209', '315'] as const
const CLEANING = ['110', '402'] as const
const OUT_OF_SERVICE = { number: '516', note: 'Air conditioning repair' } as const

export interface RoomsSeedResult {
  readonly planId: string
  readonly placed: number
  readonly unplaced: number
}

export async function seedRooms(db: Kysely<DB>, now: Date): Promise<RoomsSeedResult> {
  return db.transaction().execute(async (tx) => {
    await sql`select private.set_audit_context(p_actor_type => 'system', p_action => 'seed', p_undoable => false)`.execute(tx)
    await tx.updateTable('rooms').set({ housekeeping_status: 'needs_cleaning' }).where('number', 'in', NEEDS_CLEANING).execute()
    await tx.updateTable('rooms').set({ housekeeping_status: 'cleaning' }).where('number', 'in', CLEANING).execute()
    await tx.updateTable('rooms').set({ out_of_service: true, notes: OUT_OF_SERVICE.note }).where('number', '=', OUT_OF_SERVICE.number).execute()
    const plan = await runAllocation(tx, now)
    return { planId: plan.proposal_id, placed: plan.placed, unplaced: plan.unplaced }
  })
}
