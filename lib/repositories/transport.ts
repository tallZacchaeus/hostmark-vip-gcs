// The transport board (FR-FT-06/07, 03-App-Flow.md /transport): one day's pickups on a timeline
// per driver, pickups still without a driver, and the pending driver decisions. Suggested drivers
// appear as ghost blocks on their own row. Runs as the signed-in coordinator (RLS applies).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { boardRange, pickDay } from '@/lib/domain/transport/board'
import { type PickupKind, tripWindow } from '@/lib/domain/transport/matcher'
import { addDays, zonedDateKey, zonedDayStart } from '@/lib/domain/time'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'

export type TripState = 'done' | 'progress' | 'planned' | 'suggested' | 'unassigned'
export type DriverState = 'on_trip' | 'available' | 'off_shift' | 'inactive'

export interface BoardTrip {
  readonly pickup_id: string
  readonly assignment_id: string | null
  readonly proposal_id: string | null
  readonly label: string
  readonly principal_guest_id: string | null
  readonly pickup_at: string
  readonly window_start: string
  readonly window_end: string
  readonly kind: PickupKind
  readonly state: TripState
  readonly pickup_status: string
  readonly pickup_location: string
  readonly passenger_count: number
  readonly flight_number: string | null
  readonly acknowledged: boolean
}

export interface BoardDriver {
  readonly id: string
  readonly full_name: string
  readonly vehicle_label: string | null
  readonly vehicle_capacity: number
  readonly state: DriverState
  readonly shifts: { readonly starts_at: string; readonly ends_at: string }[]
  readonly trips: BoardTrip[]
}

export interface BoardDecision {
  readonly proposal_id: string
  readonly kind: string
  readonly title: string
  readonly summary: string | null
  readonly also_changes: string | null
  readonly alternatives: string[]
  readonly pickup_id: string
  readonly created_at: string
}

export interface TransportBoard {
  readonly day: string
  readonly days: string[]
  readonly timezone: string
  readonly range: { readonly start: string; readonly end: string }
  readonly drivers: BoardDriver[]
  readonly needs_driver: BoardTrip[]
  readonly decisions: BoardDecision[]
  readonly pickup_count: number
}

interface PickupRow {
  readonly id: string
  readonly kind: PickupKind
  readonly pickup_at: Date
  readonly status: string
  readonly pickup_location: string
  readonly passenger_count: number
  readonly delegation_name: string
  readonly principal_guest_id: string | null
  readonly principal_name: string | null
  readonly flight_number: string | null
}

interface AssignmentRow {
  readonly id: string
  readonly pickup_id: string
  readonly driver_id: string
  readonly status: string
  readonly acknowledged_at: Date | null
}

interface ProposalRow {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly summary: string | null
  readonly rationale: { also_changes?: string | null; alternatives?: string[] }
  readonly payload: { driver_ids?: string[] }
  readonly target_id: string
  readonly created_at: Date
}

const iso = (value: Date | string): string => new Date(value).toISOString()

async function pickupDays(tx: Tx, timeZone: string): Promise<string[]> {
  const { rows } = await sql<{ day: string }>`
    select distinct (pickup_at at time zone ${timeZone})::date::text as day from public.pickups where status <> 'cancelled' order by day`.execute(tx)
  return rows.map((row) => row.day)
}

async function pickupsOn(tx: Tx, start: string, end: string): Promise<PickupRow[]> {
  const { rows } = await sql<PickupRow>`
    select p.id, p.kind, p.pickup_at, p.status, p.pickup_location, p.passenger_count, d.name as delegation_name,
      d.principal_guest_id, g.full_name as principal_name, f.flight_number
    from public.pickups p
    join public.arrivals a on a.id = p.arrival_id
    join public.delegations d on d.id = a.delegation_id
    left join public.guests g on g.id = d.principal_guest_id
    left join public.flights f on f.id = a.flight_id
    where p.status <> 'cancelled' and p.pickup_at >= ${start}::timestamptz and p.pickup_at < ${end}::timestamptz
    order by p.pickup_at`.execute(tx)
  return rows
}

/** "Okafor +3": the principal's surname (or the delegation) and the rest of the party. */
function tripLabel(pickup: PickupRow): string {
  const name = pickup.principal_name?.trim().split(/\s+/).at(-1) ?? pickup.delegation_name
  return pickup.passenger_count > 1 ? `${name} +${pickup.passenger_count - 1}` : name
}

function tripState(pickupStatus: string, assignmentStatus: string | null): TripState {
  if (assignmentStatus === 'completed' || pickupStatus === 'completed') return 'done'
  if (pickupStatus === 'en_route' || pickupStatus === 'picked_up') return 'progress'
  return assignmentStatus === 'active' ? 'planned' : 'unassigned'
}

interface BoardInputs {
  readonly pickups: PickupRow[]
  readonly assignments: AssignmentRow[]
  readonly proposals: ProposalRow[]
  readonly travel: { readonly airport_travel_min: number; readonly local_travel_min: number }
}

function toTrip(pickup: PickupRow, inputs: BoardInputs, extra: Pick<BoardTrip, 'assignment_id' | 'proposal_id' | 'state' | 'acknowledged'>): BoardTrip {
  const window = tripWindow(pickup.pickup_at, pickup.kind, inputs.travel)
  return {
    pickup_id: pickup.id,
    label: tripLabel(pickup),
    principal_guest_id: pickup.principal_guest_id,
    pickup_at: iso(pickup.pickup_at),
    window_start: iso(new Date(window.start)),
    window_end: iso(new Date(window.end)),
    kind: pickup.kind,
    pickup_status: pickup.status,
    pickup_location: pickup.pickup_location,
    passenger_count: pickup.passenger_count,
    flight_number: pickup.flight_number,
    ...extra,
  }
}

function tripsFor(driverId: string, inputs: BoardInputs): BoardTrip[] {
  const assigned = inputs.assignments
    .filter((assignment) => assignment.driver_id === driverId)
    .flatMap((assignment) => {
      const pickup = inputs.pickups.find((item) => item.id === assignment.pickup_id)
      return pickup
        ? [toTrip(pickup, inputs, { assignment_id: assignment.id, proposal_id: null, state: tripState(pickup.status, assignment.status), acknowledged: assignment.acknowledged_at !== null })]
        : []
    })
  const suggested = inputs.proposals
    .filter((proposal) => proposal.payload.driver_ids?.includes(driverId))
    .flatMap((proposal) => {
      const pickup = inputs.pickups.find((item) => item.id === proposal.target_id)
      return pickup ? [toTrip(pickup, inputs, { assignment_id: null, proposal_id: proposal.id, state: 'suggested', acknowledged: false })] : []
    })
  return [...assigned, ...suggested].sort((a, b) => a.window_start.localeCompare(b.window_start))
}

function driverState(isActive: boolean, shifts: BoardDriver['shifts'], trips: BoardTrip[], now: number, isToday: boolean): DriverState {
  if (!isActive) return 'inactive'
  if (isToday && trips.some((trip) => trip.state === 'progress')) return 'on_trip'
  const onShift = isToday
    ? shifts.some((shift) => new Date(shift.starts_at).getTime() <= now && new Date(shift.ends_at).getTime() > now)
    : shifts.length > 0
  return onShift ? 'available' : 'off_shift'
}

async function loadInputs(tx: Tx, start: string, end: string, travel: BoardInputs['travel']): Promise<BoardInputs> {
  const pickups = await pickupsOn(tx, start, end)
  const ids = pickups.map((pickup) => pickup.id)
  if (ids.length === 0) return { pickups, assignments: [], proposals: [], travel }
  const assignments = await tx
    .selectFrom('pickup_assignments')
    .select(['id', 'pickup_id', 'driver_id', 'status', 'acknowledged_at'])
    .where('pickup_id', 'in', ids)
    .where('status', 'in', ['active', 'completed'])
    .execute()
  const proposals = (await tx
    .selectFrom('proposals')
    .select(['id', 'kind', 'title', 'summary', 'rationale', 'payload', 'target_id', 'created_at'])
    .where('status', '=', 'pending')
    .where('kind', 'in', ['driver_assignment', 'driver_reassignment', 'release_pickup'])
    .where('target_type', '=', 'pickups')
    .where('target_id', 'in', ids)
    .orderBy('created_at')
    .execute()) as unknown as ProposalRow[]
  return { pickups, assignments, proposals, travel }
}

function decisionsFrom(proposals: ProposalRow[]): BoardDecision[] {
  return proposals.map((proposal) => ({
    proposal_id: proposal.id,
    kind: proposal.kind,
    title: proposal.title,
    summary: proposal.summary,
    also_changes: proposal.rationale.also_changes ?? null,
    alternatives: proposal.rationale.alternatives ?? [],
    pickup_id: proposal.target_id,
    created_at: iso(proposal.created_at),
  }))
}

export async function loadTransportBoard(tx: Tx, requestedDay: string | undefined, now: Date): Promise<TransportBoard | null> {
  const event = await tx.selectFrom('events').select(['timezone', 'airport_travel_min', 'local_travel_min']).where('id', '=', CURRENT_EVENT_ID).executeTakeFirst()
  if (!event) return null
  const days = await pickupDays(tx, event.timezone)
  const today = zonedDateKey(now, event.timezone)
  const day = pickDay(requestedDay, today, days)
  const start = zonedDayStart(day, event.timezone)
  const end = zonedDayStart(addDays(day, 1), event.timezone)
  const inputs = await loadInputs(tx, start, end, event)
  const shifts = await tx.selectFrom('driver_shifts').select(['driver_id', 'starts_at', 'ends_at']).where('starts_at', '<', new Date(end)).where('ends_at', '>', new Date(start)).execute()
  const driverRows = await tx.selectFrom('drivers').select(['id', 'full_name', 'vehicle_label', 'vehicle_capacity', 'is_active']).orderBy('full_name').execute()
  const drivers = driverRows.map((driver) => {
    const own = shifts.filter((shift) => shift.driver_id === driver.id).map((shift) => ({ starts_at: iso(shift.starts_at), ends_at: iso(shift.ends_at) }))
    const trips = tripsFor(driver.id, inputs)
    return { ...driver, shifts: own, trips, state: driverState(driver.is_active, own, trips, now.getTime(), day === today) }
  })
  const covered = new Set(inputs.assignments.map((assignment) => assignment.pickup_id))
  const needsDriver = inputs.pickups
    .filter((pickup) => !covered.has(pickup.id) && pickup.status === 'pending_assignment')
    .map((pickup) => toTrip(pickup, inputs, { assignment_id: null, proposal_id: inputs.proposals.find((item) => item.target_id === pickup.id)?.id ?? null, state: 'unassigned', acknowledged: false }))
  const blocks = [...drivers.flatMap((driver) => driver.trips), ...needsDriver].map((trip) => ({ start: new Date(trip.window_start).getTime(), end: new Date(trip.window_end).getTime() }))
  const range = boardRange(new Date(start).getTime(), blocks)
  return {
    day,
    days,
    timezone: event.timezone,
    range: { start: iso(new Date(range.start)), end: iso(new Date(range.end)) },
    drivers,
    needs_driver: needsDriver,
    decisions: decisionsFrom(inputs.proposals),
    pickup_count: inputs.pickups.length,
  }
}
