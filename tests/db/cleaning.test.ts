import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

// Every test runs in one transaction, so now() is the same instant throughout a test.
const MINUTES = (value: number) => `now() + interval '${value} minutes'`

describe('room turnaround and cleaning (P5 migration)', () => {
  const db = useTestDb()

  interface Arranged {
    readonly room: string
    readonly delegation: string
    readonly guest: string
    readonly frontDesk: string
    readonly housekeeper: string
    readonly coordinator: string
  }

  /** A party of one checked into room 412 (Suite: 60 cleaning minutes + the 15-minute buffer). */
  async function arrange(): Promise<Arranged> {
    await db().createEvent()
    const type = await db().createRoomType({ name: 'Suite', cleaning_minutes: 60 })
    const room = await db().createRoom(type, { number: '412', floor: 4, wing: 'East' })
    const delegation = await db().value<string>(`insert into delegations (name) values ('Okafor') returning id`)
    const guest = await db().value<string>(
      `insert into guests (delegation_id, member_role, full_name, status) values ($1, 'principal', 'Augustine Okafor', 'checked_in') returning id`,
      [delegation],
    )
    await db().rows(
      `insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, status, checked_in_at)
       values ($1, $2, now() - interval '2 days', now() + interval '2 hours', 'checked_in', now() - interval '2 days')`,
      [room, guest],
    )
    return {
      room,
      delegation,
      guest,
      frontDesk: await db().createProfile('accommodation', { full_name: 'Tolu Front' }),
      housekeeper: await db().createProfile('housekeeping', { full_name: 'Chioma Eze' }),
      coordinator: await db().createProfile('coordinator'),
    }
  }

  async function checkOut(as: string, delegation: string): Promise<{ rooms: string[] }> {
    await db().asUser(as)
    const result = await db().value<{ rooms: string[] }>('select public.check_out_party($1)', [delegation])
    await db().asOwner()
    return result
  }

  const taskOf = (room: string) =>
    db().one<{ id: string; status: string; ready_ok: boolean }>(
      `select id, status::text, estimated_ready_at = now() + interval '75 minutes' as ready_ok from cleaning_tasks where room_id = $1 order by created_at desc limit 1`,
      [room],
    )
  const roomStatus = (room: string) => db().value<string>('select housekeeping_status::text from rooms where id = $1', [room])

  it('checks a party out: the room needs cleaning, a task is queued and housekeeping is told (no guest names)', async () => {
    const { room, delegation, guest, frontDesk } = await arrange()

    expect(await checkOut(frontDesk, delegation)).toMatchObject({ rooms: ['412'] })

    expect(await db().one('select status::text, checked_out_by from room_assignments where guest_id = $1', [guest])).toEqual({ status: 'checked_out', checked_out_by: frontDesk })
    expect(await db().value('select status::text from guests where id = $1', [guest])).toBe('checked_out')
    expect(await roomStatus(room)).toBe('needs_cleaning')
    expect(await taskOf(room)).toMatchObject({ status: 'pending', ready_ok: true })
    const notes = await db().rows<{ title: string; role: string }>(
      `select n.title, p.role::text as role from notifications n join profiles p on p.id = n.recipient_id where n.kind = 'room_needs_cleaning'`,
    )
    expect(notes).toEqual([{ title: 'Room 412 needs cleaning', role: 'housekeeping' }])
  })

  it('lets the first check-out win: a second one is told who did it and when', async () => {
    const { delegation, frontDesk, coordinator } = await arrange()
    await checkOut(frontDesk, delegation)

    await db().asUser(coordinator)
    const second = await db().expectError(() => db().rows('select public.check_out_party($1)', [delegation]))
    expect(second.hint).toBe('already_checked_out')
    expect(JSON.parse(second.detail ?? '{}')).toMatchObject({ by: 'Tolu Front', at: expect.any(String) })
  })

  it('refuses check-out to housekeeping and drivers', async () => {
    const { delegation, housekeeper } = await arrange()
    const driver = await db().createProfile('driver')
    for (const user of [housekeeper, driver]) {
      await db().asUser(user)
      expect((await db().expectError(() => db().rows('select public.check_out_party($1)', [delegation]))).hint).toBe('forbidden')
      await db().asOwner()
    }
  })

  it('does not queue cleaning while someone else is still checked into the room', async () => {
    const { room, delegation, frontDesk } = await arrange()
    const other = await db().value<string>(`insert into delegations (name) values ('Eze') returning id`)
    const otherGuest = await db().value<string>(`insert into guests (delegation_id, member_role, full_name, status) values ($1, 'principal', 'Ngozi Eze', 'checked_in') returning id`, [other])
    await db().rows(
      `insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, status, checked_in_at)
       values ($1, $2, now() - interval '1 day', now() + interval '1 day', 'checked_in', now() - interval '1 day')`,
      [room, otherGuest],
    )

    await checkOut(frontDesk, delegation)

    expect(await roomStatus(room)).toBe('clean')
    expect(await db().value<number>('select count(*)::int from cleaning_tasks')).toBe(0)
  })

  it('shows housekeeping the queue with "needed by" from the next stay, but never who is coming', async () => {
    const { room, delegation, frontDesk, housekeeper } = await arrange()
    const next = await db().value<string>(`insert into delegations (name) values ('Next party') returning id`)
    const nextGuest = await db().value<string>(`insert into guests (delegation_id, member_role, full_name) values ($1, 'principal', 'Next Guest') returning id`, [next])
    await checkOut(frontDesk, delegation)
    await db().rows(
      `insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at) values ($1, $2, ${MINUTES(180)}, ${MINUTES(3000)})`,
      [room, nextGuest],
    )

    await db().asUser(housekeeper)
    expect(await db().value<number>('select count(*)::int from room_assignments')).toBe(0)
    expect(await db().value<number>('select count(*)::int from cleaning_tasks')).toBe(1)
    expect((await db().expectError(() => db().rows('select stay_ids from cleaning_tasks'))).code).toBe('42501')
    const [row] = await db().rows<Record<string, unknown>>('select * from public.cleaning_queue()')
    expect(row).toMatchObject({ room_number: '412', wing: 'East', floor: 4, room_type: 'Suite', status: 'pending', cleaning_minutes: 60, buffer_minutes: 15 })
    expect(row?.needed_by).toBeInstanceOf(Date)
    expect(Object.keys(row ?? {}).some((key) => /guest|name|delegation/.test(key))).toBe(false)
    await db().asOwner()

    const driver = await db().createProfile('driver')
    await db().asUser(driver)
    expect((await db().expectError(() => db().rows('select * from public.cleaning_queue()'))).hint).toBe('forbidden')
  })

  it('runs Start → Done: the room is cleaning, then clean, and the front desk hears it is ready', async () => {
    const { room, delegation, frontDesk, housekeeper } = await arrange()
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)

    await db().asUser(housekeeper)
    await db().rows('select public.start_cleaning($1)', [id])
    const again = await db().expectError(() => db().rows('select public.start_cleaning($1)', [id]))
    expect(again.hint).toBe('already_started')
    await db().asOwner()
    expect(await roomStatus(room)).toBe('cleaning')

    await db().asUser(housekeeper)
    await db().rows('select public.complete_cleaning($1)', [id])
    await db().asOwner()
    expect(await roomStatus(room)).toBe('clean')
    expect(await db().one('select status::text, completed_by from cleaning_tasks where id = $1', [id])).toEqual({ status: 'done', completed_by: housekeeper })
    expect(await db().value<number>(`select count(*)::int from notifications n join profiles p on p.id = n.recipient_id where n.kind = 'room_ready' and p.role = 'accommodation'`)).toBe(1)

    // "Undo" right after a mistaken "Mark ready".
    await db().asUser(housekeeper)
    await db().rows('select public.undo_complete_cleaning($1)', [id])
    await db().asOwner()
    expect(await roomStatus(room)).toBe('cleaning')
    expect(await db().value('select status::text from cleaning_tasks where id = $1', [id])).toBe('in_progress')
  })

  it('needs Start before Done, and refuses cleaning actions to the front desk', async () => {
    const { room, delegation, frontDesk, housekeeper } = await arrange()
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)

    await db().asUser(housekeeper)
    expect((await db().expectError(() => db().rows('select public.complete_cleaning($1)', [id]))).hint).toBe('not_started')
    await db().asOwner()
    await db().asUser(frontDesk)
    expect((await db().expectError(() => db().rows('select public.start_cleaning($1)', [id]))).hint).toBe('forbidden')
  })

  it('reverses a mistaken check-out: guests back in, room restored, unstarted task cancelled (coordinators only)', async () => {
    const { room, delegation, guest, frontDesk, coordinator } = await arrange()
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)

    await db().asUser(frontDesk)
    expect((await db().expectError(() => db().rows('select public.reverse_checkout($1)', [id]))).hint).toBe('forbidden')
    await db().asOwner()
    await db().asUser(coordinator)
    expect(await db().value('select public.reverse_checkout($1)', [id])).toMatchObject({ room_number: '412', restored: 1 })
    await db().asOwner()

    expect(await db().one('select status::text, checkout_reversed_by from room_assignments where guest_id = $1', [guest])).toEqual({ status: 'checked_in', checkout_reversed_by: coordinator })
    expect(await db().value('select status::text from guests where id = $1', [guest])).toBe('checked_in')
    expect(await roomStatus(room)).toBe('clean')
    expect(await db().value('select status::text from cleaning_tasks where id = $1', [id])).toBe('cancelled')
  })

  it('refuses a reversal once cleaning has started', async () => {
    const { room, delegation, frontDesk, housekeeper, coordinator } = await arrange()
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)
    await db().asUser(housekeeper)
    await db().rows('select public.start_cleaning($1)', [id])
    await db().asOwner()

    await db().asUser(coordinator)
    expect((await db().expectError(() => db().rows('select public.reverse_checkout($1)', [id]))).hint).toBe('cleaning_started')
  })

  it('refuses Undo on Mark ready once the room has been turned around again', async () => {
    const { room, delegation, frontDesk, housekeeper } = await arrange()
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)
    await db().asUser(housekeeper)
    await db().rows('select public.start_cleaning($1)', [id])
    await db().rows('select public.complete_cleaning($1)', [id])
    await db().asOwner()
    // Someone else stays briefly and leaves: a new task opens for the room.
    const next = await db().value<string>(`insert into delegations (name) values ('Brief') returning id`)
    const nextGuest = await db().value<string>(`insert into guests (delegation_id, member_role, full_name, status) values ($1, 'principal', 'Brief Guest', 'checked_in') returning id`, [next])
    await db().rows(
      `insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, status, checked_in_at) values ($1, $2, now(), now() + interval '1 day', 'checked_in', now())`,
      [room, nextGuest],
    )
    await checkOut(frontDesk, next)

    await db().asUser(housekeeper)
    expect((await db().expectError(() => db().rows('select public.undo_complete_cleaning($1)', [id]))).hint).toBe('room_in_use')
  })

  it('will not reverse a task that covers several parties sharing the room', async () => {
    const { room, delegation, frontDesk, coordinator } = await arrange()
    const other = await db().value<string>(`insert into delegations (name) values ('Sharer') returning id`)
    const sharer = await db().value<string>(`insert into guests (delegation_id, member_role, full_name, status) values ($1, 'principal', 'Sharer', 'checked_in') returning id`, [other])
    await db().rows(
      `insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, status, checked_in_at) values ($1, $2, now() - interval '1 day', now() + interval '1 day', 'checked_in', now() - interval '1 day')`,
      [room, sharer],
    )
    await checkOut(frontDesk, other)
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)
    // The first leaver is not on the task (the room was still occupied); a task spanning parties
    // is a defensive case, built directly here.
    await db().rows(`update cleaning_tasks set stay_ids = stay_ids || (select array_agg(id) from room_assignments where guest_id = $2) where id = $1`, [id, sharer])

    await db().asUser(coordinator)
    expect((await db().expectError(() => db().rows('select public.reverse_checkout($1)', [id]))).hint).toBe('shared_room')
  })

  it('records a reported problem on the task and tells the coordinators', async () => {
    const { room, delegation, frontDesk, housekeeper, coordinator } = await arrange()
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)

    await db().asUser(housekeeper)
    await db().rows(`select public.report_cleaning_problem($1, 'maintenance', 'Shower is leaking')`, [id])
    expect((await db().expectError(() => db().rows(`select public.report_cleaning_problem($1, 'flood', null)`, [id]))).code).toBe('22P02')
    await db().asOwner()

    expect(await db().one('select problem_kind::text, problem_note from cleaning_tasks where id = $1', [id])).toEqual({ problem_kind: 'maintenance', problem_note: 'Shower is leaking' })
    expect(await db().rows(`select title, body from notifications where kind = 'cleaning_problem' and recipient_id = $1`, [coordinator])).toEqual([
      { title: 'Room 412: maintenance needed', body: 'Shower is leaking' },
    ])
  })

  it('feeds readiness into the hard rule: a room being cleaned is ready when the clean is expected to end', async () => {
    const { room, delegation, frontDesk, housekeeper } = await arrange()
    const later = await db().value<string>(`insert into delegations (name) values ('Later') returning id`)
    const laterGuest = await db().value<string>(`insert into guests (delegation_id, member_role, full_name) values ($1, 'principal', 'Later Guest') returning id`, [later])
    await checkOut(frontDesk, delegation)
    const { id } = await taskOf(room)
    const blocker = (minutes: number) =>
      db().value<string | null>(`select private.room_unavailability($1, $2, ${MINUTES(minutes)}, ${MINUTES(minutes + 1440)})`, [room, laterGuest])

    // Not started: cleaning could begin now, so the room is ready in 75 minutes.
    expect(await blocker(70)).toBe('not_ready')
    expect(await blocker(80)).toBeNull()

    // Started 50 minutes ago: ready 25 minutes from now.
    await db().asUser(housekeeper)
    await db().rows('select public.start_cleaning($1)', [id])
    await db().asOwner()
    await db().rows(`update cleaning_tasks set started_at = now() - interval '50 minutes' where id = $1`, [id])
    expect(await blocker(20)).toBe('not_ready')
    expect(await blocker(30)).toBeNull()
  })

  it('queues cleaning of the old room when a checked-in guest is moved', async () => {
    const { room, guest, coordinator } = await arrange()
    const type = await db().createRoomType({ name: 'Standard', cleaning_minutes: 30 })
    const target = await db().createRoom(type, { number: '101' })

    await db().asUser(coordinator)
    await db().rows(`select public.assign_room($1, $2, 'Air conditioning failed', array['checked_in'])`, [guest, target])
    await db().asOwner()

    expect(await roomStatus(room)).toBe('needs_cleaning')
    expect(await taskOf(room)).toMatchObject({ status: 'pending' })
  })
})
