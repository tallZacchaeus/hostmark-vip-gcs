// Transport cascade evaluation (PRD §8, M2): on an in-memory database, builds a synthetic event day
// (flights, parties, drivers on overlapping shifts, trips assigned by the matcher), then applies a
// seeded stream of flight changes through the real ingestion and reports
//   - reassignment latency: ingestion → cascade done, p50 / p95 / max (target p95 ≤ 5 s)
//   - feasibility: every proposed driver is free and on shift when the proposal is made
//   - double bookings left on the board, coordinator alerts, and how many proposals approve
// No network, no cost; the same --seed gives the same day and the same changes.
//   pnpm eval:cascade [--flights N] [--drivers N] [--updates N] [--seed N]
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { createMigratedPglite } from '@/db/tooling/pglite'
import { pglitePool } from '@/db/tooling/pglite-pool'
import { withSystem } from '@/lib/db/system'
import type { DB } from '@/lib/db/types'
import { type MatchTrip, matchDrivers } from '@/lib/domain/transport/matcher'
import type { FlightSnapshot } from '@/lib/flights/provider'
import { ingestFlightUpdate } from '@/lib/services/flights/ingest'

const DAY = '2026-11-20'
const TRAVEL = { airport_travel_min: 60, local_travel_min: 45 }
const VEHICLES = [4, 6, 7, 14, 18] as const
const SHIFTS = [
  ['05:00', '14:00'],
  ['11:00', '21:00'],
] as const
const TARGET_P95_MS = 5_000
const MINUTE = 60_000

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? Number.NaN : Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Small seeded PRNG (mulberry32), so runs are repeatable. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const between = (rand: () => number, min: number, max: number): number => Math.floor(min + rand() * (max - min + 1))
const at = (time: string): string => `${DAY}T${time}:00Z`

interface Day {
  readonly flights: { id: string; scheduled: string }[]
  readonly drivers: number
  readonly pickups: number
}

async function buildDay(db: Kysely<DB>, rand: () => number, flightCount: number, driverCount: number): Promise<Day> {
  await sql`insert into events (name, venue_name, timezone, starts_on, ends_on, arrival_airports) values ('Eval', 'Venue', 'UTC', ${DAY}, ${DAY}, '{LOS}')`.execute(db)
  const drivers = await db
    .insertInto('drivers')
    .values(Array.from({ length: driverCount }, (_, index) => ({ full_name: `Driver ${index + 1}`, vehicle_capacity: VEHICLES[index % VEHICLES.length] ?? 4 })))
    .returning('id')
    .execute()
  await db
    .insertInto('driver_shifts')
    .values(drivers.map((driver, index) => ({ driver_id: driver.id, starts_at: at(SHIFTS[index % 2]?.[0] ?? '05:00'), ends_at: at(SHIFTS[index % 2]?.[1] ?? '21:00') })))
    .execute()
  const flights: Day['flights'] = []
  let pickups = 0
  for (let index = 0; index < flightCount; index += 1) {
    const landing = new Date(Date.parse(at('07:00')) + between(rand, 0, 13 * 60) * MINUTE).toISOString()
    const flight = await db.insertInto('flights').values({ flight_number: `EV${100 + index}`, arrival_date_local: DAY, scheduled_arrival_at: landing, destination_iata: 'LOS' }).returning('id').executeTakeFirstOrThrow()
    flights.push({ id: flight.id, scheduled: landing })
    for (let party = 0; party < between(rand, 1, 2); party += 1) {
      pickups += await addParty(db, flight.id, landing, between(rand, 1, 5), `F${index}P${party}`)
    }
  }
  return { flights, drivers: drivers.length, pickups }
}

async function addParty(db: Kysely<DB>, flightId: string, landing: string, size: number, name: string): Promise<number> {
  const delegation = await db.insertInto('delegations').values({ name }).returning('id').executeTakeFirstOrThrow()
  const arrival = await db.insertInto('arrivals').values({ delegation_id: delegation.id, flight_id: flightId, mode: 'flying' }).returning('id').executeTakeFirstOrThrow()
  await db.insertInto('guests').values(Array.from({ length: size }, (_, index) => ({ delegation_id: delegation.id, arrival_id: arrival.id, full_name: `${name} ${index}` }))).execute()
  await db
    .insertInto('pickups')
    .values({ arrival_id: arrival.id, kind: 'airport', pickup_at: new Date(Date.parse(landing) + 30 * MINUTE).toISOString(), pickup_location: 'LOS', passenger_count: size })
    .execute()
  return 1
}

/** Initial plan: the matcher assigns every pickup in time order, as approved suggestions would. */
async function assignAll(db: Kysely<DB>): Promise<number> {
  const drivers = await db.selectFrom('drivers').select(['id', 'full_name', 'vehicle_label', 'vehicle_capacity', 'is_active']).execute()
  const shifts = await db.selectFrom('driver_shifts').select(['driver_id', 'starts_at', 'ends_at']).execute()
  const pickups = await db.selectFrom('pickups').select(['id', 'pickup_at', 'kind', 'passenger_count']).orderBy('pickup_at').execute()
  let trips: MatchTrip[] = []
  let assigned = 0
  for (const pickup of pickups) {
    const match = matchDrivers({ pickup_id: pickup.id, pickup_at: pickup.pickup_at, kind: pickup.kind, passenger_count: pickup.passenger_count, current_driver_ids: [] }, drivers, shifts, trips, TRAVEL)
    if (!match) continue
    await db.insertInto('pickup_assignments').values(match.driver_ids.map((driverId) => ({ pickup_id: pickup.id, driver_id: driverId, acknowledged_at: new Date() }))).execute()
    await db.updateTable('pickups').set({ status: 'assigned' }).where('id', '=', pickup.id).execute()
    trips = [...trips, ...match.driver_ids.map((driverId) => ({ pickup_id: pickup.id, driver_id: driverId, pickup_at: pickup.pickup_at, kind: pickup.kind }))]
    assigned += 1
  }
  return assigned
}

function change(rand: () => number, scheduled: string): FlightSnapshot {
  const roll = rand()
  const base = { scheduled_arrival_at: scheduled, actual_arrival_at: null, origin_iata: 'ADD', destination_iata: 'LOS' }
  if (roll < 0.05) return { ...base, phase: 'cancelled', estimated_arrival_at: null }
  const minutes = roll < 0.75 ? between(rand, 10, 150) : roll < 0.9 ? -between(rand, 5, 30) : 0
  return { ...base, phase: 'in_air', estimated_arrival_at: new Date(Date.parse(scheduled) + minutes * MINUTE).toISOString() }
}

interface Sample {
  readonly wall_ms: number
  readonly db_ms: number | null
  readonly proposals: string[]
  /** Proposals whose drivers could all take the trip when it was made. */
  readonly feasible: number
  readonly alerts: number
}

async function applyUpdates(db: Kysely<DB>, rand: () => number, day: Day, count: number): Promise<Sample[]> {
  const cancelled = new Set<string>()
  const samples: Sample[] = []
  for (let index = 0; index < count; index += 1) {
    const open = day.flights.filter((flight) => !cancelled.has(flight.id))
    const flight = open[between(rand, 0, open.length - 1)]
    if (!flight) break
    const snapshot = change(rand, flight.scheduled)
    if (snapshot.phase === 'cancelled') cancelled.add(flight.id)
    const started = performance.now()
    const result = await withSystem(db, { actor: 'system', action: 'eval.flight_update', undoable: false }, (tx) =>
      ingestFlightUpdate(tx, { flight_id: flight.id, snapshot, source: 'simulated', observed_at: new Date() }),
    )
    const wall = performance.now() - started
    const row = result.flight_update_id ? await db.selectFrom('flight_updates').select('cascade_ms').where('id', '=', result.flight_update_id).executeTakeFirst() : undefined
    const feasible = (await Promise.all(result.proposal_ids.map((id) => isFeasible(db, id)))).filter(Boolean).length
    samples.push({ wall_ms: wall, db_ms: row?.cascade_ms ?? null, proposals: result.proposal_ids, feasible, alerts: result.plan?.alerts.length ?? 0 })
  }
  return samples
}

/** A proposal is feasible when every proposed driver could take the trip. */
async function isFeasible(db: Kysely<DB>, proposalId: string): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean | null }>`
    select bool_and(private.driver_unavailability(d.value::uuid, private.trip_window(p), p.id) is null) as ok
    from public.proposals pr
    join public.pickups p on p.id = (pr.payload ->> 'pickup_id')::uuid
    cross join lateral jsonb_array_elements_text(coalesce(pr.payload -> 'driver_ids', '[]'::jsonb)) d
    where pr.id = ${proposalId}::uuid`.execute(db)
  return rows[0]?.ok ?? true
}

async function doubleBookings(db: Kysely<DB>): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n
    from public.pickup_assignments a1 join public.pickups p1 on p1.id = a1.pickup_id
    join public.pickup_assignments a2 on a2.driver_id = a1.driver_id and a2.id > a1.id
    join public.pickups p2 on p2.id = a2.pickup_id
    where a1.status = 'active' and a2.status = 'active'
      and p1.status not in ('cancelled', 'completed') and p2.status not in ('cancelled', 'completed')
      and private.trip_window(p1) && private.trip_window(p2)`.execute(db)
  return rows[0]?.n ?? 0
}

/**
 * Approves every proposal still pending, oldest first, as a coordinator would (vip_app, RLS and
 * the role check apply); reports how many could be carried out.
 */
async function approveAll(db: Kysely<DB>): Promise<{ approved: number; failed: number; failures: Record<string, number> }> {
  const coordinator = await db
    .insertInto('profiles')
    .values({ full_name: 'Eval Coordinator', email: 'eval.coordinator@example.com', role: 'coordinator', must_change_password: false })
    .returning('id')
    .executeTakeFirstOrThrow()
  // On the event's team, as an account created in the app would be (P9: staff work only on their events).
  await sql`insert into event_members (event_id, profile_id) select e.id, ${coordinator.id} from events e`.execute(db)
  const pending = await db.selectFrom('proposals').select('id').where('status', '=', 'pending').orderBy('created_at').execute()
  let approved = 0
  let failed = 0
  const failures: Record<string, number> = {}
  for (const proposal of pending) {
    const outcome = await db.transaction().execute(async (tx) => {
      await sql`select set_config('role', 'vip_app', true), set_config('app.user_id', ${coordinator.id}, true)`.execute(tx)
      const { rows } = await sql<{ result: { status: string; error?: string } }>`select public.approve_proposal(${proposal.id}::uuid) as result`.execute(tx)
      return rows[0]?.result
    })
    if (outcome?.status === 'approved') {
      approved += 1
    } else {
      failed += 1
      const reason = outcome?.error ?? outcome?.status ?? 'unknown'
      failures[reason] = (failures[reason] ?? 0) + 1
    }
  }
  return { approved, failed, failures }
}

function percentile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] ?? 0
}

async function main(): Promise<void> {
  const flights = argument('flights', 30)
  const drivers = argument('drivers', 18)
  const updates = argument('updates', 150)
  const seed = argument('seed', 42)
  const rand = random(seed)
  const pglite = await createMigratedPglite()
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pglitePool(pglite) }) })
  try {
    const day = await buildDay(db, rand, flights, drivers)
    const assigned = await assignAll(db)
    const samples = await applyUpdates(db, rand, day, updates)
    const bookingsBefore = await doubleBookings(db)
    const approvals = await approveAll(db)
    const bookingsAfter = await doubleBookings(db)
    const wall = samples.map((sample) => sample.wall_ms)
    const inDb = samples.flatMap((sample) => (sample.db_ms === null ? [] : [sample.db_ms]))
    const report = {
      seed,
      day: { flights, pickups: day.pickups, drivers: day.drivers, assigned_at_start: assigned },
      updates: samples.length,
      latency_ms: {
        wall: { p50: Math.round(percentile(wall, 0.5)), p95: Math.round(percentile(wall, 0.95)), max: Math.round(Math.max(...wall)) },
        in_db: { p50: percentile(inDb, 0.5), p95: percentile(inDb, 0.95), max: Math.max(...inDb) },
        target_p95: TARGET_P95_MS,
        meets_target: percentile(wall, 0.95) <= TARGET_P95_MS,
      },
      proposals: {
        created: samples.reduce((sum, sample) => sum + sample.proposals.length, 0),
        feasible_when_made: samples.reduce((sum, sample) => sum + sample.feasible, 0),
        // The latest suggestion per pickup, approved oldest first at the end of the day.
        pending_at_end: approvals.approved + approvals.failed,
        ...approvals,
      },
      alerts: samples.reduce((sum, sample) => sum + sample.alerts, 0),
      // A moved trip clashing with the driver's next one stays on the board until its
      // reassignment is approved (or, with nobody free, the coordinator acts on the alert).
      double_bookings: { before_approvals: bookingsBefore, after_approvals: bookingsAfter },
    }
    const dir = path.join(import.meta.dirname, 'results')
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `cascade-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\nSaved ${path.relative(process.cwd(), file)}\n`)
  } finally {
    await db.destroy()
  }
}

void main()
