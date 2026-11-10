// Room list import (FR-PL-04): all-or-nothing upsert by room number. A dry run reports what would
// change without writing, so the admin can preview a hotel's list before committing it. A real
// import also says which existing rooms it took out of service, so their stays can be re-planned.
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { CsvRowError, RoomCsvRow } from '@/lib/domain/rooms-csv'

export interface ImportSummary {
  readonly rows: number
  readonly created: number
  readonly updated: number
  readonly dry_run: boolean
}

export interface ImportResult {
  readonly summary: ImportSummary
  /** Rooms that were in service and are not any more, by room number. */
  readonly taken_out_of_service: string[]
}

function invalidImport(errors: readonly CsvRowError[]): ApiError {
  return new ApiError(400, 'import_invalid', 'The file has problems; nothing was imported', { errors })
}

export function assertNoParseErrors(errors: readonly CsvRowError[]): void {
  if (errors.length > 0) {
    throw invalidImport(errors)
  }
}

interface RoomTypeRef {
  readonly id: string
  readonly defaultCapacity: number
}

async function resolveRoomTypes(tx: Tx, rows: readonly RoomCsvRow[]): Promise<Map<string, RoomTypeRef>> {
  const types = await tx.selectFrom('room_types').select(['id', 'name', 'default_capacity']).execute()
  const byName = new Map(
    types.map((type) => [type.name.toLowerCase(), { id: type.id, defaultCapacity: type.default_capacity }]),
  )
  const unknown = [...new Set(rows.map((row) => row.roomTypeName).filter((name) => !byName.has(name.toLowerCase())))]
  if (unknown.length > 0) {
    throw invalidImport(
      unknown.map((name) => ({ line: 0, message: `Unknown room type "${name}". Create it first or fix the name.` })),
    )
  }
  return byName
}

/** Existing rooms in service that this file marks out of service, by room number. */
async function goingOutOfService(tx: Tx, rows: readonly RoomCsvRow[]): Promise<string[]> {
  const numbers = rows.filter((row) => row.outOfService).map((row) => row.number)
  if (numbers.length === 0) return []
  // Locked until the import commits, so a concurrent save of the same room cannot also see the change.
  const rooms = await tx.selectFrom('rooms').select('id').where('number', 'in', numbers).where('out_of_service', '=', false).orderBy('number').forUpdate().execute()
  return rooms.map((room) => room.id)
}

export async function importRooms(tx: Tx, rows: readonly RoomCsvRow[], dryRun: boolean): Promise<ImportResult> {
  if (rows.length === 0) {
    throw invalidImport([{ line: 0, message: 'The file has no rooms' }])
  }
  const roomTypes = await resolveRoomTypes(tx, rows)

  if (dryRun) {
    const existing = await tx
      .selectFrom('rooms')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('number', 'in', rows.map((row) => row.number))
      .executeTakeFirstOrThrow()
    const updated = Number(existing.n)
    return { summary: { rows: rows.length, created: rows.length - updated, updated, dry_run: true }, taken_out_of_service: [] }
  }

  const takenOutOfService = await goingOutOfService(tx, rows)

  const results = await tx
    .insertInto('rooms')
    .values(
      rows.map((row) => {
        // resolveRoomTypes has already rejected unknown names, so the lookup always succeeds.
        const roomType = roomTypes.get(row.roomTypeName.toLowerCase()) as RoomTypeRef
        return {
          number: row.number,
          floor: row.floor,
          wing: row.wing,
          position: row.position,
          room_type_id: roomType.id,
          capacity: row.capacity ?? roomType.defaultCapacity,
          is_accessible: row.isAccessible,
          out_of_service: row.outOfService,
          notes: row.notes,
        }
      }),
    )
    .onConflict((conflict) =>
      conflict.constraint('rooms_number_unique').doUpdateSet((eb) => ({
        floor: eb.ref('excluded.floor'),
        wing: eb.ref('excluded.wing'),
        position: eb.ref('excluded.position'),
        room_type_id: eb.ref('excluded.room_type_id'),
        capacity: eb.ref('excluded.capacity'),
        is_accessible: eb.ref('excluded.is_accessible'),
        out_of_service: eb.ref('excluded.out_of_service'),
        notes: eb.ref('excluded.notes'),
      })),
    )
    // xmax = 0 only for freshly inserted rows: tells creates apart from updates.
    .returning(sql<boolean>`xmax = 0`.as('inserted'))
    .execute()

  const created = results.filter((result) => result.inserted).length
  return { summary: { rows: rows.length, created, updated: results.length - created, dry_run: false }, taken_out_of_service: takenOutOfService }
}
