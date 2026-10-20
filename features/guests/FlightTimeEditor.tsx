'use client'
// Manual landing time and "Check now" on the guest profile (FR-FT-02/11). A time set here wins
// over flight data until cleared; either way the pickups move and drivers are told at once.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { apiSend } from '@/lib/client/api'
import { dateKey, formatTime, zonedDateTime } from '@/lib/client/format'
import { useAction } from '@/lib/client/use-action'
import { refreshApi } from '@/lib/client/use-api'

interface FlightTimeEditorProps {
  readonly flightId: string
  readonly manualArrivalAt: string | null
  /** Best known landing time, to prefill the form. */
  readonly landingAt: string | null
  readonly timeZone: string
}

interface ChangeResult {
  readonly changed: boolean
  readonly proposal_ids: string[]
}

const refresh = () => refreshApi('/api/guests', '/api/arrivals', '/api/transport', '/api/decisions')

function outcome(result: ChangeResult, nothing: string): string {
  if (!result.changed) return nothing
  return result.proposal_ids.length > 0 ? `Updated. ${result.proposal_ids.length} driver decision(s) are waiting for you.` : 'Updated. Pickups moved and drivers were told.'
}

export function FlightTimeEditor({ flightId, manualArrivalAt, landingAt, timeZone }: FlightTimeEditorProps) {
  const toast = useToast()
  const action = useAction()
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState(landingAt ? dateKey(landingAt, timeZone) : '')
  const [time, setTime] = useState(landingAt ? formatTime(landingAt, timeZone) : '')

  const send = (path: string, body: unknown, nothing: string) =>
    action.run(async () => {
      const result = await apiSend<ChangeResult>(path, 'POST', body)
      toast.show({ message: outcome(result, nothing) })
      setEditing(false)
      await refresh()
    })
  const save = () => send(`/api/flights/${flightId}/override`, { manual_arrival_at: zonedDateTime(day, time, timeZone) }, 'No change.')

  if (!editing) {
    return (
      <div className="flight-time-actions">
        {manualArrivalAt ? <p className="flight-time-note">Landing time set by hand: {formatTime(manualArrivalAt, timeZone)}.</p> : null}
        <Button kind="secondary" disabled={action.busy} onClick={() => setEditing(true)}>
          Set landing time
        </Button>
        {manualArrivalAt ? (
          <Button kind="ghost" busy={action.busy} onClick={() => void send(`/api/flights/${flightId}/override`, { manual_arrival_at: null }, 'No change.')}>
            Use flight data again
          </Button>
        ) : (
          <Button kind="ghost" busy={action.busy} onClick={() => void send(`/api/flights/${flightId}/refresh`, {}, 'Flight data unchanged.')}>
            Check now
          </Button>
        )}
        {action.error ? <p className="form-error" role="alert">{action.error}</p> : null}
      </div>
    )
  }
  return (
    <form
      className="flight-time-form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label>
        <span>Day</span>
        <input type="date" required value={day} onChange={(event) => setDay(event.target.value)} />
      </label>
      <label>
        <span>Lands at ({timeZone})</span>
        <input type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
      </label>
      <div>
        <Button kind="primary" type="submit" busy={action.busy} disabled={!day || !time}>
          Save
        </Button>
        <Button kind="ghost" disabled={action.busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {action.error ? <p className="form-error" role="alert">{action.error}</p> : null}
    </form>
  )
}
