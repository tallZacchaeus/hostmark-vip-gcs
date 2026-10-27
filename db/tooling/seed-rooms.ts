// Rooms demo data (P4, P5) on top of the seeded guests: a few rooms waiting for or under cleaning
// (with their cleaning tasks, so Sanitation and the housekeeping phone show them) and one out of
// service, so the grid shows every state, then the real allocator drafts a plan for every guest.
// The plan is left pending for the coordinator to review on /rooms/plan.
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
    // Checked out 20–50 minutes ago; the rooms being cleaned were started 15 minutes ago.
    await sql`
      insert into public.cleaning_tasks (event_id, room_id, status, checked_out_at, estimated_ready_at, started_at)
      select r.event_id, r.id, t.status::public.cleaning_status, t.out_at,
        t.out_at + make_interval(mins => rt.cleaning_minutes + e.cleaning_delay_buffer_min), t.started_at
      from public.rooms r
      join public.room_types rt on rt.id = r.room_type_id
      join public.events e on e.id = r.event_id
      join lateral (
        select case when r.housekeeping_status = 'cleaning' then 'in_progress' else 'pending' end as status,
          ${now}::timestamptz - make_interval(mins => 20 + (abs(hashtext(r.number)) % 31)) as out_at,
          case when r.housekeeping_status = 'cleaning' then ${now}::timestamptz - interval '15 minutes' end as started_at
      ) t on true
      where r.number in (${sql.join([...NEEDS_CLEANING, ...CLEANING])})`.execute(tx)
    await tx.updateTable('rooms').set({ out_of_service: true, notes: OUT_OF_SERVICE.note }).where('number', '=', OUT_OF_SERVICE.number).execute()
    const plan = await runAllocation(tx, now)
    return { planId: plan.proposal_id, placed: plan.placed, unplaced: plan.unplaced }
  })
}
