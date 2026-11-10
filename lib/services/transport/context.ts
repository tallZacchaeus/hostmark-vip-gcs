// The snapshot the transport planner works on: event timings, drivers, shifts, every live trip,
// and the parties on one flight. Reads only, so it serves the worker (vip_system), the what-if
// preview and suggestions (as the coordinator, under row-level security) alike.
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { FlightPhase } from '@/lib/domain/flights/schedule'
import type { CascadeArrival, CascadeEvent, CascadeFlight, CascadePickup } from '@/lib/domain/transport/cascade'
import type { MatchDriver, MatchShift, MatchTrip } from '@/lib/domain/transport/matcher'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'

export interface TransportEvent extends CascadeEvent {
  readonly id: string
  readonly delay_threshold_min: number
  readonly flight_mode: 'live' | 'simulated'
}

export interface TransportContext {
  readonly event: TransportEvent
  readonly drivers: MatchDriver[]
  readonly shifts: MatchShift[]
  readonly trips: MatchTrip[]
}

const toIso = (value: Date | string): string => new Date(value).toISOString()

export async function loadTransportEvent(tx: Tx): Promise<TransportEvent> {
  const event = await tx
    .selectFrom('events')
    .select(['id', 'timezone', 'venue_name', 'arrival_airports', 'airport_exit_buffer_min', 'airport_travel_min', 'local_travel_min', 'delay_threshold_min', 'flight_mode'])
    .where('id', '=', CURRENT_EVENT_ID)
    .executeTakeFirst()
  if (!event) throw new ApiError(409, 'event_not_found', 'Set up the event first')
  return { ...event, flight_mode: event.flight_mode as TransportEvent['flight_mode'] }
}

export async function loadTransportContext(tx: Tx): Promise<TransportContext> {
  const event = await loadTransportEvent(tx)
  const drivers = await tx.selectFrom('drivers').select(['id', 'full_name', 'vehicle_label', 'vehicle_capacity', 'is_active']).orderBy('full_name').execute()
  const shifts = await tx
    .selectFrom('driver_shifts')
    .select(['driver_id', 'starts_at', 'ends_at'])
    .where('ends_at', '>', sql<Date>`now() - interval '2 days'`)
    .execute()
  // A driver named in a pending suggestion is held for it: other suggestions do not offer the same
  // driver for an overlapping trip until that one is approved, rejected or superseded.
  const { rows: trips } = await sql<MatchTrip>`
    select a.pickup_id, a.driver_id, p.pickup_at, p.kind
    from public.pickup_assignments a
    join public.pickups p on p.id = a.pickup_id
    where a.status = 'active' and p.status not in ('cancelled', 'completed')
    union all
    select p.id as pickup_id, d.value::uuid as driver_id, p.pickup_at, p.kind
    from public.proposals pr
    join public.pickups p on p.id = (pr.payload ->> 'pickup_id')::uuid
    cross join lateral jsonb_array_elements_text(coalesce(pr.payload -> 'driver_ids', '[]'::jsonb)) d
    where pr.status = 'pending' and pr.kind in ('driver_assignment', 'driver_reassignment')
      and p.status not in ('cancelled', 'completed')`.execute(tx)
  return { event, drivers, shifts, trips }
}

export interface FlightParties {
  readonly flight: CascadeFlight
  readonly arrivals: CascadeArrival[]
  readonly pickups: CascadePickup[]
}

export async function loadFlightParties(tx: Tx, flightId: string): Promise<FlightParties> {
  const flight = await tx
    .selectFrom('flights')
    .select(['id', 'flight_number', 'phase', 'scheduled_arrival_at', 'estimated_arrival_at', 'actual_arrival_at', 'manual_arrival_at'])
    .where('id', '=', flightId)
    .executeTakeFirst()
  if (!flight) throw new ApiError(404, 'not_found', 'Flight not found')
  const { rows: arrivals } = await sql<CascadeArrival>`
    select a.id, d.name as delegation_name, a.expected_at_venue_at,
      (select count(*)::int from public.guests g where g.arrival_id = a.id and g.status <> 'cancelled') as passenger_count
    from public.arrivals a
    join public.delegations d on d.id = a.delegation_id
    where a.flight_id = ${flightId}::uuid and a.status <> 'cancelled'
    order by a.created_at`.execute(tx)
  const { rows: pickups } = await sql<CascadePickup>`
    select p.id, p.arrival_id, p.kind, p.pickup_at, p.pickup_location, p.status, p.passenger_count,
      coalesce(array_agg(pa.driver_id::text) filter (where pa.status = 'active'), '{}') as driver_ids
    from public.pickups p
    join public.arrivals a on a.id = p.arrival_id
    left join public.pickup_assignments pa on pa.pickup_id = p.id
    where a.flight_id = ${flightId}::uuid
    group by p.id`.execute(tx)
  return {
    flight: { ...flight, phase: flight.phase as FlightPhase },
    arrivals: arrivals.map((arrival) => ({ ...arrival, expected_at_venue_at: arrival.expected_at_venue_at ? toIso(arrival.expected_at_venue_at) : null })),
    pickups: pickups.map((pickup) => ({ ...pickup, pickup_at: toIso(pickup.pickup_at) })),
  }
}
