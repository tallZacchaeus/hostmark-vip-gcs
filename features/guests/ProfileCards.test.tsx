import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@/lib/client/activity-format'
import { renderWithApp } from '@/tests/support/render'
import { ArrivalCard, HistoryCard, IssuesCard, TransportCard } from './ProfileCards'
import type { GuestProfile, Requirement } from './types'

const LAGOS = 'Africa/Lagos'

type Arrival = NonNullable<GuestProfile['arrival']>
type Flight = NonNullable<GuestProfile['flight']>

const arrival = (overrides: Partial<Arrival> = {}): Arrival => ({
  id: 'a-1',
  mode: 'flying',
  stated_arrival_at: null,
  requested_pickup_at: null,
  pickup_address: null,
  expected_at_venue_at: null,
  status: 'expected',
  ...overrides,
})

const flight = (overrides: Partial<Flight> = {}): Flight => ({
  id: 'f-1',
  flight_number: 'EK783',
  origin_iata: 'DXB',
  destination_iata: 'LOS',
  scheduled_arrival_at: null,
  estimated_arrival_at: null,
  actual_arrival_at: null,
  manual_arrival_at: null,
  phase: 'scheduled',
  ...overrides,
})

// Only the fields these cards read; the rest of the profile is irrelevant to them.
const profile = (parts: Partial<Pick<GuestProfile, 'arrival' | 'flight' | 'pickup'>>): GuestProfile =>
  ({ arrival: null, flight: null, pickup: null, ...parts }) as GuestProfile

describe('ArrivalCard', () => {
  it('says when no arrival is recorded', () => {
    renderWithApp(<ArrivalCard profile={profile({})} timeZone={LAGOS} />)
    expect(screen.getByText('No arrival recorded.')).toBeInTheDocument()
  })

  it('shows the flight, its route, the best known landing time and the phase', () => {
    renderWithApp(
      <ArrivalCard
        profile={profile({
          arrival: arrival({ expected_at_venue_at: '2026-10-28T15:10:00Z' }),
          flight: flight({ scheduled_arrival_at: '2026-10-28T12:40:00Z', estimated_arrival_at: '2026-10-28T13:25:00Z', phase: 'in_air' }),
        })}
        timeZone={LAGOS}
      />,
    )
    expect(screen.getByText('EK783')).toBeInTheDocument()
    expect(screen.getByText(/DXB to LOS/)).toBeInTheDocument()
    expect(screen.getByText('Wed 28 Oct 14:25')).toBeInTheDocument()
    expect(screen.getByText('In the air')).toBeInTheDocument()
    expect(screen.getByText('16:10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check now' })).toBeInTheDocument()
  })

  it('waits for flight tracking when no time is known, and shows unknown phases as sent', () => {
    renderWithApp(<ArrivalCard profile={profile({ arrival: arrival(), flight: flight({ origin_iata: null, destination_iata: null, phase: 'boarding' }) })} timeZone={LAGOS} />)
    expect(screen.getByText('Time to follow')).toBeInTheDocument()
    expect(screen.getByText('The landing time will be filled in from flight tracking.')).toBeInTheDocument()
    expect(screen.getByText('boarding')).toBeInTheDocument()
    expect(screen.getByText('EK783').closest('p')).toHaveTextContent(/^EK783$/)
  })

  it('describes a pickup from an address, and arrivals by their own transport', () => {
    const { unmount } = renderWithApp(
      <ArrivalCard profile={profile({ arrival: arrival({ mode: 'pickup', pickup_address: 'Victoria Island', requested_pickup_at: '2026-10-28T15:30:00Z' }) })} timeZone={LAGOS} />,
    )
    expect(screen.getByText('Pickup from Victoria Island')).toBeInTheDocument()
    expect(screen.getByText('Wed 28 Oct 16:30')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check now' })).not.toBeInTheDocument()
    unmount()

    renderWithApp(<ArrivalCard profile={profile({ arrival: arrival({ mode: 'own_transport', stated_arrival_at: '2026-10-28T09:00:00Z' }) })} timeZone={LAGOS} />)
    expect(screen.getByText('Arriving by their own transport')).toBeInTheDocument()
    expect(screen.getByText('Wed 28 Oct 10:00')).toBeInTheDocument()
  })
})

describe('TransportCard', () => {
  it('lists the booked pickup with its driver status', () => {
    renderWithApp(
      <TransportCard
        profile={profile({
          pickup: { id: 'p-1', kind: 'airport', pickup_location: 'LOS arrivals', dropoff_location: null, pickup_at: '2026-10-28T13:10:00Z', passenger_count: 3, status: 'assigned' },
        })}
        timeZone={LAGOS}
      />,
    )
    expect(screen.getByText('Wed 28 Oct 14:10')).toBeInTheDocument()
    expect(screen.getByText('LOS arrivals')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Driver assigned')).toBeInTheDocument()
  })

  it('explains why there is no pickup yet', () => {
    const { unmount } = renderWithApp(<TransportCard profile={profile({ arrival: arrival({ mode: 'own_transport' }) })} timeZone={LAGOS} />)
    expect(screen.getByText('No pickup needed: arriving by their own transport.')).toBeInTheDocument()
    unmount()
    renderWithApp(<TransportCard profile={profile({})} timeZone={LAGOS} />)
    expect(screen.getByText('A pickup is booked once the landing time is known.')).toBeInTheDocument()
  })
})

const requirement = (overrides: Partial<Requirement>): Requirement => ({
  id: 'r-1',
  guest_id: 'g-1',
  category: 'medical',
  detail: 'Nut allergy',
  source: 'extraction',
  needs_attention: true,
  conflicts_with: null,
  resolved_at: null,
  submission_source: 'form',
  reference_code: null,
  ...overrides,
})

describe('IssuesCard', () => {
  it('says when nothing needs attention, still listing plain requirements', () => {
    renderWithApp(
      <IssuesCard
        requirements={[requirement({ id: 'r-9', category: 'dietary', detail: 'Halal meals', needs_attention: false }), requirement({ id: 'r-8', resolved_at: '2026-10-27T10:00:00Z' })]}
        busy={false}
        onResolve={vi.fn()}
        onAddAsGuest={vi.fn()}
      />,
    )
    expect(screen.getByText('Nothing needs attention.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Requirements' })).getByText('Halal meals')).toBeInTheDocument()
  })

  it('explains each issue and offers the right actions', async () => {
    const onResolve = vi.fn()
    const onAddAsGuest = vi.fn()
    const conflict = requirement({ id: 'r-2', category: 'transport', detail: 'Says they will drive', conflicts_with: 'arrival_mode', reference_code: 'VIP-AB12', submission_source: 'form' })
    const extra = requirement({ id: 'r-3', category: 'other', detail: 'A driver may come too', reference_code: 'VIP-9M2X', submission_source: 'pasted_message' })
    renderWithApp(<IssuesCard requirements={[conflict, extra]} busy={false} onResolve={onResolve} onAddAsGuest={onAddAsGuest} />)

    expect(screen.getByText('Transport · contradicts arrival mode · from registration VIP-AB12')).toBeInTheDocument()
    expect(screen.getByText('Other · from pasted message VIP-9M2X')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add as guest' })).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'Requirements' })).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add as guest' }))
    await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[0] as HTMLElement)
    expect(onAddAsGuest).toHaveBeenCalledWith(extra)
    expect(onResolve).toHaveBeenCalledWith(conflict)
  })

  it('disables the actions while a change is being saved', () => {
    renderWithApp(<IssuesCard requirements={[requirement({ category: 'schedule' })]} busy onResolve={vi.fn()} onAddAsGuest={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Add as guest' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled()
  })
})

const audit = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: '41',
  occurred_at: '2026-10-26T09:00:05Z',
  actor_type: 'user',
  actor_id: 'u-2',
  actor_name: 'Tolu Adebayo',
  action: 'guests.update',
  entity_type: 'guests',
  entity_id: 'g-1',
  before: { full_name: 'Augustine Okafor' },
  after: { full_name: 'Augustine Okafor' },
  reason: null,
  proposal_id: null,
  is_automatic: false,
  undoable: false,
  undo_of_audit_id: null,
  undone: false,
  ...overrides,
})

describe('HistoryCard', () => {
  it('says when nothing has changed yet', () => {
    renderWithApp(<HistoryCard history={[]} timeZone={LAGOS} undoing={null} onUndo={vi.fn()} />)
    expect(screen.getByText('No changes recorded yet.')).toBeInTheDocument()
  })

  it('lists changes with Undo only on undoable ones', async () => {
    const onUndo = vi.fn()
    const automatic = audit({ id: '42', actor_type: 'system', is_automatic: true, undoable: true })
    renderWithApp(
      <HistoryCard history={[audit({}), automatic, audit({ id: '43', undoable: true, undone: true })]} timeZone={LAGOS} undoing={null} onUndo={onUndo} />,
    )

    expect(screen.getAllByText('Tolu Adebayo updated guest Augustine Okafor')).toHaveLength(2)
    expect(screen.getByText('AUTO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undone' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledWith(automatic)
  })

  it('disables Undo while that change is being undone', () => {
    renderWithApp(<HistoryCard history={[audit({ undoable: true })]} timeZone={LAGOS} undoing="41" onUndo={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})
