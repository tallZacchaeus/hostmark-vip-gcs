// Programme writes (FR-PG-01/02), as the signed-in user: row-level security lets only the programs
// team and Admin write, and the database recomputes the at-risk flag after every change. An item must
// start on an event day (in the event time zone), else the Programme screen would have no tab for it.
import { sql } from 'kysely'
import { ApiError, Errors } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { ParticipantsInput, ProgramItemInput } from '@/lib/validation/programme'

const toRow = (input: ProgramItemInput) => ({ ...input, description: input.description ?? null })

const shortDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatDay = (day: string): string => shortDay.format(new Date(`${day}T12:00:00Z`))

/** Refuses a start outside the event days, naming them (as a field problem on `starts_at`). */
async function assertOnEventDay(tx: Tx, startsAt: string): Promise<void> {
  const { rows } = await sql<{ inside: boolean; starts_on: string; ends_on: string }>`
    select (${startsAt}::timestamptz at time zone timezone)::date between starts_on and ends_on as inside, starts_on::text, ends_on::text
    from public.events limit 1`.execute(tx)
  const event = rows[0]
  if (!event || event.inside) return
  const message = `Pick one of the event days (${formatDay(event.starts_on)} to ${formatDay(event.ends_on)})`
  throw new ApiError(400, 'validation_failed', 'Some fields are missing or invalid', [{ path: 'starts_at', message }])
}

export async function createProgramItem(tx: Tx, input: ProgramItemInput): Promise<{ id: string }> {
  await assertOnEventDay(tx, input.starts_at)
  return tx.insertInto('program_items').values(toRow(input)).returning('id').executeTakeFirstOrThrow()
}

/** An item left outside by a change of event days can keep its start (to be edited or cancelled). */
export async function updateProgramItem(tx: Tx, id: string, input: ProgramItemInput): Promise<{ id: string }> {
  const current = await tx.selectFrom('program_items').select('starts_at').where('id', '=', id).executeTakeFirst()
  if (!current) throw Errors.notFound('Programme item')
  if (new Date(current.starts_at).getTime() !== Date.parse(input.starts_at)) await assertOnEventDay(tx, input.starts_at)
  const row = await tx.updateTable('program_items').set(toRow(input)).where('id', '=', id).returning('id').executeTakeFirst()
  if (!row) throw Errors.notFound('Programme item')
  return row
}

export async function deleteProgramItem(tx: Tx, id: string): Promise<void> {
  const row = await tx.deleteFrom('program_items').where('id', '=', id).returning('id').executeTakeFirst()
  if (!row) throw Errors.notFound('Programme item')
}

/** Replaces the item's participants: removes those not listed, adds or re-roles the rest. */
export async function setParticipants(tx: Tx, id: string, input: ParticipantsInput): Promise<{ count: number }> {
  const item = await tx.selectFrom('program_items').select('id').where('id', '=', id).executeTakeFirst()
  if (!item) throw Errors.notFound('Programme item')
  const guestIds = input.participants.map((participant) => participant.guest_id)
  let removal = tx.deleteFrom('program_participants').where('program_item_id', '=', id)
  if (guestIds.length > 0) removal = removal.where('guest_id', 'not in', guestIds)
  await removal.execute()
  if (input.participants.length > 0) {
    await tx
      .insertInto('program_participants')
      .values(input.participants.map((participant) => ({ program_item_id: id, guest_id: participant.guest_id, role: participant.role })))
      .onConflict((conflict) => conflict.columns(['program_item_id', 'guest_id']).doUpdateSet((eb) => ({ role: eb.ref('excluded.role') })))
      .execute()
  }
  return { count: input.participants.length }
}

export async function notifyProgrammeTeam(tx: Tx, id: string): Promise<{ id: string; notified_at: string }> {
  const { rows } = await sql<{ result: { id: string; notified_at: string } }>`select public.notify_program_risk(${id}::uuid) as result`.execute(tx)
  const result = rows[0]?.result
  if (!result) throw Errors.notFound('Programme item')
  return result
}
