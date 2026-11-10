// Arranges a small venue and delegations for the room tests (as the database owner): floors 1–3,
// West rooms x01–x03 and East x04–x06, suites (tier 1) on floor 3, standard rooms below, room 101
// accessible. Stays run on EVENT_DAY from the arrival time to the event's last day.
import { EVENT_DAY } from '@/tests/support/event-dates'
import type { TestApp } from './test-app'

export { EVENT_DAY }

export interface Venue {
  readonly rooms: ReadonlyMap<string, string>
}

export interface Party {
  readonly delegation_id: string
  readonly arrival_id: string
  readonly principal_id: string
  readonly member_ids: string[]
}

const first = <T>(rows: T[]): T => {
  const [row] = rows
  if (!row) throw new Error('Expected a row')
  return row
}

export async function addVenue(app: TestApp): Promise<Venue> {
  const suite = first(await app.sql<{ id: string }>(`insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Suite', 1, 2, 60) returning id`))
  const standard = first(await app.sql<{ id: string }>(`insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Standard', 2, 2, 30) returning id`))
  const rooms = new Map<string, string>()
  for (const floor of [1, 2, 3]) {
    for (const position of [1, 2, 3, 4, 5, 6]) {
      const number = `${floor}0${position}`
      const row = first(
        await app.sql<{ id: string }>(
          `insert into rooms (number, floor, wing, position, room_type_id, capacity, is_accessible) values ($1, $2, $3, $4, $5, 2, $6) returning id`,
          [number, floor, position <= 3 ? 'West' : 'East', position, floor === 3 ? suite.id : standard.id, number === '101'],
        ),
      )
      rooms.set(number, row.id)
    }
  }
  return { rooms }
}

export async function addCategory(app: TestApp, name: string, rank: number): Promise<string> {
  return first(await app.sql<{ id: string }>(`insert into vip_categories (name, rank) values ($1, $2) returning id`, [name, rank])).id
}

export interface PartyOptions {
  readonly name: string
  readonly category_id: string | null
  readonly members?: number
  readonly arrival_at?: string
  readonly accessibility?: string | null
  readonly share_group?: string | null
}

export async function addParty(app: TestApp, options: PartyOptions): Promise<Party> {
  const delegation = first(await app.sql<{ id: string }>(`insert into delegations (name) values ($1) returning id`, [options.name]))
  const arrival = first(
    await app.sql<{ id: string }>(`insert into arrivals (delegation_id, mode, stated_arrival_at, expected_at_venue_at) values ($1, 'own_transport', $2, $2) returning id`, [
      delegation.id,
      options.arrival_at ?? `${EVENT_DAY}T14:00:00Z`,
    ]),
  )
  const principal = first(
    await app.sql<{ id: string }>(
      `insert into guests (delegation_id, arrival_id, member_role, full_name, vip_category_id, accessibility, share_group) values ($1, $2, 'principal', $3, $4, $5, $6) returning id`,
      [delegation.id, arrival.id, options.name, options.category_id, options.accessibility ?? null, options.share_group ?? null],
    ),
  )
  await app.sql(`update delegations set principal_guest_id = $2 where id = $1`, [delegation.id, principal.id])
  const memberIds: string[] = []
  for (let index = 0; index < (options.members ?? 0); index += 1) {
    const memberRow = first(
      await app.sql<{ id: string }>(`insert into guests (delegation_id, arrival_id, member_role, full_name) values ($1, $2, 'assistant', $3) returning id`, [
        delegation.id,
        arrival.id,
        `${options.name} aide ${index + 1}`,
      ]),
    )
    memberIds.push(memberRow.id)
  }
  return { delegation_id: delegation.id, arrival_id: arrival.id, principal_id: principal.id, member_ids: memberIds }
}
