'use client'
// A driver's day (Figma "Transport" driver drawer): shift, vehicle and every trip with its state.
// Trips open the principal guest's profile.
import Link from 'next/link'
import { useId } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { formatTime } from '@/lib/client/format'
import { type BoardDriver, TRIP_LABELS, vehicleLine } from './model'

function shiftLine(driver: BoardDriver, timeZone: string): string {
  if (driver.state === 'inactive') return 'Inactive: not offered for new trips.'
  if (driver.shifts.length === 0) return 'No shift on this day.'
  return `On shift ${driver.shifts.map((shift) => `${formatTime(shift.starts_at, timeZone)}–${formatTime(shift.ends_at, timeZone)}`).join(', ')}.`
}

export function DriverDrawer({ driver, timeZone, onClose }: { readonly driver: BoardDriver; readonly timeZone: string; readonly onClose: () => void }) {
  const titleId = useId()
  return (
    <Modal onClose={onClose} as="aside" scrimClassName="driver-drawer-backdrop" className="driver-drawer" labelledBy={titleId}>
      <header>
        <div>
          <h2 id={titleId}>{driver.full_name}</h2>
          <p>{vehicleLine(driver)}</p>
        </div>
        <button type="button" aria-label="Close driver details" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div>
        <p className="driver-note">{shiftLine(driver, timeZone)}</p>
        {driver.trips.length === 0 ? <p className="driver-note">No trips on this day.</p> : null}
        {driver.trips.map((trip) => {
          const status = TRIP_LABELS[trip.state]
          const detail = [trip.flight_number, trip.pickup_location].filter(Boolean).join(' · ')
          const body = (
            <>
              <div>
                <b>{formatTime(trip.pickup_at, timeZone)}</b>
                <span className={`arrival-badge arrival-badge--${status.tone}`}>{status.label}</span>
              </div>
              <h3>
                {trip.label}
                {trip.state === 'planned' && !trip.acknowledged ? <small className="driver-unread"> · not yet confirmed by the driver</small> : null}
              </h3>
              <p>{detail}</p>
            </>
          )
          return trip.principal_guest_id ? (
            <Link className="driver-trip" key={`${trip.pickup_id}-${trip.state}`} href={`/guests/${trip.principal_guest_id}`}>
              {body}
            </Link>
          ) : (
            <article className="driver-trip" key={`${trip.pickup_id}-${trip.state}`}>
              {body}
            </article>
          )
        })}
      </div>
    </Modal>
  )
}
