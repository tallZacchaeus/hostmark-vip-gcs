import { describe, expect, it } from 'vitest'
import { eventTime } from '@/tests/support/event-dates'
import { useTestDb } from './support/use-test-db'

const CHECK_IN = eventTime(0, '14:00:00Z')
const CHECK_OUT = eventTime(2, '11:00:00Z')

describe('room allocation (P4 migration)', () => {
  const db = useTestDb()

  async function arrange(): Promise<{ room: string; guest: string; partner: string; delegation: string }> {
    await db().createEvent()
    const type = await db().value<string>(`insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Suite', 1, 2, 60) returning id`)
    const room = await db().value<string>(`insert into rooms (number, floor, wing, room_type_id, capacity) values ('412', 4, 'East', $1, 2) returning id`, [type])
    const delegation = await db().value<string>(`insert into delegations (name) values ('Okafor') returning id`)
    const guest = await db().value<string>(`insert into guests (delegation_id, member_role, full_name, share_group) values ($1, 'principal', 'Augustine Okafor', 'okafor') returning id`, [delegation])
    const partner = await db().value<string>(`insert into guests (delegation_id, member_role, full_name) values ($1, 'family', 'Chioma Okafor') returning id`, [delegation])
    await db().rows(`insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at) values ($1, $2, $3, $4)`, [room, guest, CHECK_IN, CHECK_OUT])
    return { room, guest, partner, delegation }
  }

  it('shows stays to coordinators and the front desk only, and allows no direct writes', async () => {
    const { room, partner } = await arrange()
    const visible: Record<string, number> = {}
    for (const role of ['coordinator', 'accommodation', 'housekeeping', 'driver', 'programs'] as const) {
      const user = await db().createProfile(role)
      await db().asUser(user)
      visible[role] = await db().value<number>('select count(*)::int from room_assignments')
      await db().asOwner()
    }
    expect(visible).toEqual({ coordinator: 1, accommodation: 1, housekeeping: 0, driver: 0, programs: 0 })

    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)
    const direct = await db().expectError(() =>
      db().rows(`insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at) values ($1, $2, $3, $4)`, [room, partner, CHECK_IN, CHECK_OUT]),
    )
    expect(direct.code).toBe('42501')
  })

  it('lets the front desk read category names but not change rooms', async () => {
    const { room, partner } = await arrange()
    await db().rows(`insert into vip_categories (name, rank) values ('Cat. 1', 1)`)
    const frontDesk = await db().createProfile('accommodation')
    await db().asUser(frontDesk)

    expect(await db().value<number>('select count(*)::int from vip_categories')).toBe(1)
    const refused = await db().expectError(() => db().rows('select public.assign_room($1, $2)', [partner, room]))
    expect(refused.hint).toBe('forbidden')
  })

  it('applies the hard rules: share groups may share, others may not, and beds run out', async () => {
    const { room, guest, partner, delegation } = await arrange()
    const reason = (guestId: string) => db().value<string | null>('select private.room_unavailability($1, $2, $3, $4)', [room, guestId, CHECK_IN, CHECK_OUT])

    expect(await reason(partner)).toBe('occupied')
    await db().rows(`update guests set share_group = 'okafor' where id = $1`, [partner])
    expect(await reason(partner)).toBeNull()
    await db().rows(`insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at) values ($1, $2, $3, $4)`, [room, partner, CHECK_IN, CHECK_OUT])
    const third = await db().value<string>(`insert into guests (delegation_id, member_role, full_name, share_group) values ($1, 'assistant', 'Aide', 'okafor') returning id`, [delegation])
    expect(await reason(third)).toBe('capacity')
    // After checkout the room is kept for cleaning (60 min + the 15 min buffer).
    const later = (start: string) => db().value<string | null>('select private.room_unavailability($1, $2, $3, $4)', [room, third, start, eventTime(3, '11:00:00Z')])
    await db().rows(`update guests set share_group = null where id = $1`, [third])
    expect(await later(eventTime(2, '12:00:00Z'))).toBe('occupied')
    expect(await later(eventTime(2, '12:30:00Z'))).toBeNull()
    expect(guest).toBeTruthy()
  })

  it('decides plan lines only through their plan, and refuses check-in for other staff', async () => {
    const { guest, delegation } = await arrange()
    const coordinator = await db().createProfile('coordinator')
    await db().asSystem()
    const plan = await db().value<string>(
      `select private.create_proposal(p_kind => 'room_plan', p_title => 'Plan', p_payload => '{}'::jsonb, p_created_by_type => 'system')`,
    )
    const line = await db().value<string>(
      `select private.create_proposal(p_kind => 'room_assignment', p_title => 'Line', p_payload => '{}'::jsonb, p_created_by_type => 'system',
         p_target_type => 'guests', p_target_id => $1::uuid, p_parent_id => $2::uuid)`,
      [guest, plan],
    )
    await db().asOwner()
    await db().asUser(coordinator)
    expect((await db().expectError(() => db().rows('select public.approve_proposal($1)', [line]))).hint).toBe('is_line')
    await db().asOwner()

    const housekeeper = await db().createProfile('housekeeping')
    await db().asUser(housekeeper)
    expect((await db().expectError(() => db().rows('select public.check_in_party($1)', [delegation]))).hint).toBe('forbidden')
  })
})
