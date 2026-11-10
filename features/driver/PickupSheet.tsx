'use client'
// Trip details (Figma "Pickup details" bottom sheet): where to, from where, who, the flight, and
// a call to the coordination desk when the event has its number.
import { useId } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { formatTime } from '@/lib/client/format'
import { CallCoordinator } from './CallCoordinator'
import { type DriverTrip, changeNotice, flightStatus, personName } from './model'

interface PickupSheetProps {
  readonly trip: DriverTrip
  readonly timeZone: string
  readonly coordinatorPhone: string | null
  readonly onClose: () => void
}

export function PickupSheet({ trip, timeZone, coordinatorPhone, onClose }: PickupSheetProps) {
  const titleId = useId()
  const flight = flightStatus(trip)
  const change = trip.previous_pickup_at && trip.previous_pickup_at !== trip.pickup_at ? changeNotice({ ...trip, acknowledged_at: null }, timeZone) : null
  const passengers = trip.passengers ?? []
  return (
    <Modal onClose={onClose} scrimClassName="pickup-sheet-scrim" className="pickup-sheet" labelledBy={titleId}>
      <i className="sheet-grab" />
      <header>
        <h2 id={titleId}>{formatTime(trip.pickup_at, timeZone)}</h2>
        <button type="button" aria-label="Close pickup details" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="sheet-section">
        <b>DESTINATION</b>
        <p>{trip.dropoff_location ?? 'The venue'}</p>
      </div>
      <div className="sheet-section">
        <b>PICKUP FROM</b>
        <p>{trip.pickup_location}</p>
      </div>
      <div className="sheet-section">
        <b>PASSENGERS ({trip.passenger_count})</b>
        <div className="sheet-passengers">
          {passengers.map((passenger, index) => (
            <p key={`${passenger.full_name ?? 'guest'}-${index}`}>
              <span>{personName(passenger)}</span>
              {passenger.role === 'principal' && trip.principal.category ? <i>{trip.principal.category}</i> : null}
            </p>
          ))}
        </div>
      </div>
      {flight && trip.flight_number ? (
        <div className="sheet-section">
          <b>FLIGHT</b>
          <p>
            {trip.flight_number} · {flight.label}
          </p>
        </div>
      ) : null}
      {change ? (
        <div className="sheet-change">
          <Icon name="alert" size={16} />
          {change}
        </div>
      ) : null}
      <CallCoordinator phone={coordinatorPhone} light />
    </Modal>
  )
}
