// Coordinator changes to guests (FR-IN-11): details, VIP category, proximity and room-share
// grouping, party members, and resolving extracted issues. Optimistic locking on `version` stops
// two people silently overwriting each other. Runs in the caller's (RLS) transaction.
import { sql } from 'kysely'
import { ApiError, Errors } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { GuestUpdate, MemberCreate } from '@/lib/validation/guests'

const staleVersion = (): ApiError =>
  new ApiError(409, 'stale_version', 'Someone else changed this guest. Reload to see the latest details.')

/** Keeps live pickups' passenger counts equal to the party size. */
async function syncPassengerCount(tx: Tx, delegationId: string): Promise<void> {
  await sql`
    update public.pickups p
    set passenger_count = greatest(1, (
      select count(*) from public.guests g where g.delegation_id = ${delegationId}::uuid and g.status <> 'cancelled'
    ))
    from public.arrivals a
    where a.id = p.arrival_id and a.delegation_id = ${delegationId}::uuid
      and p.status not in ('cancelled', 'completed')`.execute(tx)
}

export async function updateGuest(tx: Tx, id: string, input: GuestUpdate) {
  const { version, ...changes } = input
  const naming = changes.full_name ? { is_placeholder: false } : {}
  const updated = await tx
    .updateTable('guests')
    .set({ ...changes, ...naming })
    .where('id', '=', id)
    .where('version', '=', version)
    .returningAll()
    .executeTakeFirst()
  if (!updated) {
    const exists = await tx.selectFrom('guests').select('id').where('id', '=', id).executeTakeFirst()
    throw exists ? staleVersion() : Errors.notFound('Guest')
  }
  if (updated.member_role === 'principal' && (changes.title !== undefined || changes.full_name !== undefined)) {
    const name = [updated.title, updated.full_name].filter(Boolean).join(' ')
    await tx.updateTable('delegations').set({ name }).where('id', '=', updated.delegation_id).execute()
  }
  if (changes.status !== undefined) await syncPassengerCount(tx, updated.delegation_id)
  return updated
}

export async function addMember(tx: Tx, delegationId: string, input: MemberCreate, actorId: string) {
  const principal = await tx
    .selectFrom('delegations as d')
    .innerJoin('guests as g', 'g.id', 'd.principal_guest_id')
    .select(['g.arrival_id', 'g.expected_departure_at'])
    .where('d.id', '=', delegationId)
    .executeTakeFirst()
  if (!principal) throw Errors.notFound('Delegation')
  const member = await tx
    .insertInto('guests')
    .values({
      delegation_id: delegationId,
      member_role: input.member_role,
      full_name: input.full_name ?? null,
      is_placeholder: !input.full_name,
      dietary: input.dietary,
      accessibility: input.accessibility ?? null,
      arrival_id: principal.arrival_id,
      expected_departure_at: principal.expected_departure_at,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  if (input.requirement_id) await resolveRequirement(tx, input.requirement_id, actorId)
  await syncPassengerCount(tx, delegationId)
  return member
}

export async function removeMember(tx: Tx, id: string) {
  const guest = await tx.selectFrom('guests').select(['id', 'member_role', 'delegation_id']).where('id', '=', id).executeTakeFirst()
  if (!guest) throw Errors.notFound('Guest')
  if (guest.member_role === 'principal') {
    throw new ApiError(409, 'cannot_remove_principal', 'The principal guest cannot be removed from the delegation')
  }
  await tx.deleteFrom('guests').where('id', '=', id).execute()
  await syncPassengerCount(tx, guest.delegation_id)
  return { id }
}

export async function resolveRequirement(tx: Tx, id: string, actorId: string) {
  const row = await tx
    .updateTable('guest_requirements')
    .set({ resolved_at: new Date(), resolved_by: actorId })
    .where('id', '=', id)
    .where('resolved_at', 'is', null)
    .returning(['id', 'resolved_at'])
    .executeTakeFirst()
  if (row) return row
  const exists = await tx.selectFrom('guest_requirements').select('id').where('id', '=', id).executeTakeFirst()
  throw exists ? new ApiError(409, 'already_resolved', 'This issue has already been resolved') : Errors.notFound('Issue')
}
