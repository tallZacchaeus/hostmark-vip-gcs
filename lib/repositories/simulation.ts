// What the simulation screen reads (03-App-Flow.md /simulation): recent scripted runs with what they
// act on (flights, rooms, delegations), and the flights, drivers and rooms the what-if form can
// pick. Runs as the coordinator (RLS applies).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { findScenario } from '@/lib/domain/simulation/scenarios'

const RECENT_RUNS = 10

export interface RunSummary {
  readonly id: string
  readonly scenario_key: string
  readonly title: string
  readonly status: string
  readonly speed: number
  readonly steps_applied: number
  readonly steps_total: number
  readonly flight_numbers: string[]
  /** The rooms a room scenario acts on, in step order. */
  readonly room_numbers: string[]
  /** The delegations a scenario adds guests to, in step order. */
  readonly delegations: string[]
  readonly virtual_start: string
  readonly real_start: string
  readonly stopped_at: string | null
}

export interface FlightOption {
  readonly id: string
  readonly flight_number: string
  readonly scheduled_arrival_at: string | null
  readonly phase: string
  readonly delegations: string[]
}

export interface RoomOption {
  readonly id: string
  readonly number: string
  /** Who is in the room or planned into it. */
  readonly guests: string[]
}

export interface DriverOption {
  readonly id: string
  readonly full_name: string
  readonly vehicle_label: string | null
}

const iso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null)

export async function listSimulationRuns(tx: Tx): Promise<RunSummary[]> {
  const { rows } = await sql<{
    id: string
    scenario_key: string
    status: string
    speed: number
    steps_applied: number
    flight_numbers: string[]
    room_numbers: string[]
    delegations: string[]
    virtual_start: Date
    real_start: Date
    stopped_at: Date | null
  }>`
    select r.id, r.scenario_key, r.status, r.speed, r.steps_applied, r.virtual_start, r.real_start, r.stopped_at,
      coalesce((select array_agg(f.flight_number order by x.ord) from unnest(r.flight_ids) with ordinality x(id, ord)
        join public.flights f on f.id = x.id), '{}') as flight_numbers,
      coalesce((select array_agg(rm.number order by x.ord) from unnest(r.room_ids) with ordinality x(id, ord)
        join public.rooms rm on rm.id = x.id), '{}') as room_numbers,
      coalesce((select array_agg(d.name order by x.ord) from unnest(r.delegation_ids) with ordinality x(id, ord)
        join public.delegations d on d.id = x.id), '{}') as delegations
    from public.simulation_runs r
    order by r.real_start desc
    limit ${RECENT_RUNS}`.execute(tx)
  return rows.map((row) => {
    const scenario = findScenario(row.scenario_key)
    return {
      ...row,
      title: scenario?.title ?? row.scenario_key,
      steps_total: scenario?.steps.length ?? row.steps_applied,
      virtual_start: iso(row.virtual_start) ?? '',
      real_start: iso(row.real_start) ?? '',
      stopped_at: iso(row.stopped_at),
    }
  })
}

/** Flights that have not landed yet, with who is on them. */
export async function listFlightOptions(tx: Tx): Promise<FlightOption[]> {
  const { rows } = await sql<{ id: string; flight_number: string; scheduled_arrival_at: Date | null; phase: string; delegations: string[] }>`
    select f.id, f.flight_number, f.scheduled_arrival_at, f.phase,
      array_agg(distinct d.name) as delegations
    from public.flights f
    join public.arrivals a on a.flight_id = f.id and a.status <> 'cancelled'
    join public.delegations d on d.id = a.delegation_id
    where f.phase not in ('landed', 'cancelled', 'diverted')
    group by f.id
    order by coalesce(f.manual_arrival_at, f.estimated_arrival_at, f.scheduled_arrival_at) nulls last, f.flight_number`.execute(tx)
  return rows.map((row) => ({ ...row, scheduled_arrival_at: iso(row.scheduled_arrival_at) }))
}

export async function listDriverOptions(tx: Tx): Promise<DriverOption[]> {
  return tx.selectFrom('drivers').select(['id', 'full_name', 'vehicle_label']).where('is_active', '=', true).orderBy('full_name').execute()
}

/** Rooms in service with guests planned or checked in: the rooms a "room out of service" what-if can pick. */
export async function listRoomOptions(tx: Tx): Promise<RoomOption[]> {
  const { rows } = await sql<RoomOption>`
    select r.id, r.number,
      array_agg(coalesce(nullif(concat_ws(' ', g.title, g.full_name), ''), 'Guest of ' || d.name) order by g.member_role = 'principal' desc, g.created_at) as guests
    from public.rooms r
    join public.room_assignments a on a.room_id = r.id and a.status in ('planned', 'checked_in')
    join public.guests g on g.id = a.guest_id
    join public.delegations d on d.id = g.delegation_id
    where not r.out_of_service
    group by r.id
    order by r.number`.execute(tx)
  return rows
}
