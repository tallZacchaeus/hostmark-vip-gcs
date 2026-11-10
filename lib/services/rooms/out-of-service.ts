// After an Admin takes rooms out of service (Settings → Rooms, or a CSV import), the stays in them
// are re-planned exactly as in the simulation's room scenario: a planned stay gets a move
// proposal, a checked-in guest an alert (reworkRoom). Runs once the Admin's change is saved, as
// vip_system on their behalf: the Admin's edit is checked by row-level security on vip_app, and
// only vip_system may propose and notify, so the two cannot share one transaction.
// The reaction is never lost: if re-planning fails, the error is logged and the coordinators get
// a high-priority alert to check the room by hand. Room rows are locked while their stays are
// re-planned, so two reworks of one room never run side by side.
import 'server-only'
import { sql } from 'kysely'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { systemClock } from '@/lib/domain/clock'
import { logger } from '@/lib/logger'
import { notifyCoordinators } from '@/lib/services/notify'
import { reworkRoom } from './suggest'

async function rework(roomIds: readonly string[], adminId: string): Promise<number> {
  return withSystem(getSystemDb(), { actor: 'system', action: 'rooms.out_of_service', onBehalfOf: adminId, undoable: false }, async (tx) => {
    // Locked in id order (no deadlocks), then re-planned in the order given: one transaction, so
    // each room sees the moves already proposed for the ones before it.
    await sql`select id from public.rooms where id = any (${[...roomIds]}::uuid[]) order by id for update`.execute(tx)
    const now = systemClock.now()
    let proposals = 0
    for (const roomId of roomIds) {
      proposals += await reworkRoom(tx, roomId, now, { type: 'room', id: roomId })
    }
    return proposals
  })
}

/** Tells the coordinators which rooms still need their stays moved by hand. */
async function alertNotReplanned(roomIds: readonly string[], adminId: string): Promise<void> {
  await withSystem(getSystemDb(), { actor: 'system', action: 'rooms.out_of_service', onBehalfOf: adminId, undoable: false }, async (tx) => {
    const rooms = await tx.selectFrom('rooms').select(['id', 'number']).where('id', 'in', [...roomIds]).orderBy('number').execute()
    for (const room of rooms) {
      await notifyCoordinators(tx, {
        kind: 'room_alert',
        title: `Room ${room.number} was taken out of service but its stays could not be re-planned — check Rooms`,
        priority: 'high',
        entity_type: 'rooms',
        entity_id: room.id,
      })
    }
  })
}

/** Returns how many move proposals were made (0 when re-planning failed and the coordinators were alerted). */
export async function reworkRoomsTakenOutOfService(roomIds: readonly string[], adminId: string): Promise<number> {
  if (roomIds.length === 0) return 0
  try {
    return await rework(roomIds, adminId)
  } catch (error) {
    logger.error('Re-planning stays after rooms went out of service failed; alerting coordinators', { room_ids: roomIds, error })
    // If even the alert cannot be written, the request fails so the Admin knows something is wrong.
    await alertNotReplanned(roomIds, adminId)
    return 0
  }
}
