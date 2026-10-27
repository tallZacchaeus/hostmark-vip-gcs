// Programme writes (FR-PG-01/02), as the signed-in user: row-level security lets only the programs
// team and Admin write, and the database recomputes the at-risk flag after every change.
import { sql } from 'kysely'
import { Errors } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { ParticipantsInput, ProgramItemInput } from '@/lib/validation/programme'

const toRow = (input: ProgramItemInput) => ({ ...input, description: input.description ?? null })

export async function createProgramItem(tx: Tx, input: ProgramItemInput): Promise<{ id: string }> {
  return tx.insertInto('program_items').values(toRow(input)).returning('id').executeTakeFirstOrThrow()
}

export async function updateProgramItem(tx: Tx, id: string, input: ProgramItemInput): Promise<{ id: string }> {
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
