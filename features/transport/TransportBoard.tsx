'use client'
// The driver timeline (Figma "Transport" board): one row per driver with their trips placed by
// time — done, in progress, assigned, and suggested ghosts — plus a "Needs a driver" row whose
// blocks ask the matcher for a suggestion. Off-shift time is shaded; a red line marks now.
import { Icon } from '@/components/ui/Icon'
import { formatTime, plural } from '@/lib/client/format'
import { type BoardDriver, type BoardTrip, type TransportBoard as Board, DRIVER_STATES, TRIP_CLASSES, nowPosition, offShiftSpans, placeTrip, ticks, toRange, vehicleLine } from './model'

interface TransportBoardProps {
  readonly board: Board
  readonly timeZone: string
  readonly now: Date | null
  readonly hoveredProposal: string | null
  readonly suggestingId: string | null
  readonly onSuggest: (trip: BoardTrip) => void
  readonly onOpenDriver: (driver: BoardDriver) => void
}

type Range = ReturnType<typeof toRange>

function Block({ trip, range, timeZone, linked }: { readonly trip: BoardTrip; readonly range: Range; readonly timeZone: string; readonly linked: boolean }) {
  const place = placeTrip(range, trip)
  return (
    <span
      className={`timeline-block ${TRIP_CLASSES[trip.state]} ${linked ? 'is-linked' : ''}`}
      style={{ left: `${place.left}%`, width: `${place.width}%` }}
      title={`${formatTime(trip.pickup_at, timeZone)} · ${trip.label} · ${trip.pickup_location}`}
    >
      {trip.state === 'suggested' && <Icon name="sparkle" size={13} />}
      {trip.label}
    </span>
  )
}

function Track({ range, nowAt, children, shaded = [] }: { readonly range: Range; readonly nowAt: number | null; readonly children: React.ReactNode; readonly shaded?: { left: number; width: number }[] }) {
  const step = ticks(range)[1]?.left ?? 100
  return (
    <div className="driver-track">
      <div className="timeline-lines" style={{ backgroundSize: `${step}% 100%` }} />
      {shaded.map((span) => (
        <span className="off-shift" key={span.left} style={{ inset: 'auto', top: 0, bottom: 0, left: `${span.left}%`, width: `${span.width}%` }}>
          {span.width > 20 ? 'Off shift' : ''}
        </span>
      ))}
      {nowAt !== null && <i className="now-line" style={{ left: `${nowAt}%` }} />}
      {children}
    </div>
  )
}

function NeedsDriverRow({ trips, range, nowAt, timeZone, suggestingId, onSuggest }: { readonly trips: BoardTrip[]; readonly range: Range; readonly nowAt: number | null; readonly timeZone: string; readonly suggestingId: string | null; readonly onSuggest: (trip: BoardTrip) => void }) {
  const first = trips[0]
  return (
    <>
      <div className="needs-label">
        <span>
          <b>Needs a driver</b>
          <i className={trips.length === 0 ? 'is-clear' : ''}>{trips.length}</i>
        </span>
        <small>{first ? `${first.label} · ${formatTime(first.pickup_at, timeZone)}` : 'All assigned'}</small>
      </div>
      <Track range={range} nowAt={nowAt}>
        {trips.length === 0 ? (
          <span className="all-assigned">
            <Icon name="check" size={17} />
            Every pickup has a driver.
          </span>
        ) : (
          trips.map((trip) => {
            const place = placeTrip(range, trip)
            const pending = Boolean(trip.proposal_id)
            const label = pending ? `${trip.label}: suggestion waiting` : `Suggest a driver for ${trip.label} at ${formatTime(trip.pickup_at, timeZone)}`
            return (
              <button
                type="button"
                key={trip.pickup_id}
                className="timeline-block is-unassigned timeline-action"
                style={{ left: `${place.left}%`, width: `${place.width}%` }}
                disabled={pending || suggestingId === trip.pickup_id}
                aria-label={label}
                title={label}
                onClick={() => onSuggest(trip)}
              >
                {pending ? <Icon name="sparkle" size={13} /> : null}
                {trip.label}
              </button>
            )
          })
        )}
      </Track>
    </>
  )
}

function DriverRow({ driver, range, nowAt, timeZone, hoveredProposal, onOpen }: { readonly driver: BoardDriver; readonly range: Range; readonly nowAt: number | null; readonly timeZone: string; readonly hoveredProposal: string | null; readonly onOpen: () => void }) {
  const state = DRIVER_STATES[driver.state]
  return (
    <>
      <button type="button" className="driver-label" onClick={onOpen}>
        <span>
          <b>{driver.full_name}</b>
          <span className={`arrival-badge arrival-badge--${state.tone}`}>{state.label}</span>
        </span>
        <small>{vehicleLine(driver)}</small>
      </button>
      <Track range={range} nowAt={nowAt} shaded={offShiftSpans(range, driver.shifts)}>
        {driver.trips.map((trip) => (
          <Block key={`${trip.pickup_id}-${trip.state}`} trip={trip} range={range} timeZone={timeZone} linked={trip.proposal_id !== null && trip.proposal_id === hoveredProposal} />
        ))}
      </Track>
    </>
  )
}

export function TransportBoard({ board, timeZone, now, hoveredProposal, suggestingId, onSuggest, onOpenDriver }: TransportBoardProps) {
  const range = toRange(board.range)
  const nowAt = nowPosition(range, now)
  const marks = ticks(range)
  return (
    <section className="transport-board" aria-label={`Drivers: ${plural(board.drivers.length, 'driver')}`}>
      <header>
        <h2>Drivers</h2>
        <div className="board-legend">
          <span>
            <i className="legend-done" />
            Done
          </span>
          <span>
            <i className="legend-progress" />
            In progress
          </span>
          <span>
            <i className="legend-planned" />
            Assigned
          </span>
          <span>
            <i className="legend-suggested" />
            Suggested
          </span>
        </div>
      </header>
      <div className="board-scroll">
        <div className="board-grid">
          <div className="board-axis-label" />
          <div className="board-axis is-scaled">
            {marks.map((mark) => (
              <span key={mark.at} style={{ left: `${mark.left}%` }}>
                {formatTime(new Date(mark.at), timeZone)}
              </span>
            ))}
            {nowAt !== null && now ? (
              <>
                <i className="now-line" style={{ left: `${nowAt}%` }} />
                <b className="now-pill" style={{ left: `calc(${nowAt}% - 24px)` }}>
                  {formatTime(now, timeZone)}
                </b>
              </>
            ) : null}
          </div>
          <NeedsDriverRow trips={board.needs_driver} range={range} nowAt={nowAt} timeZone={timeZone} suggestingId={suggestingId} onSuggest={onSuggest} />
          {board.drivers.map((driver) => (
            <DriverRow key={driver.id} driver={driver} range={range} nowAt={nowAt} timeZone={timeZone} hoveredProposal={hoveredProposal} onOpen={() => onOpenDriver(driver)} />
          ))}
        </div>
      </div>
    </section>
  )
}
