'use client'
import { useState } from 'react'
import { Field, FormDialog, unmet } from '@/components/ui/FormDialog'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useSession, useTimeZone } from '@/components/shell/SessionContext'
import { apiSend, errorMessage } from '@/lib/client/api'
import { addDays, dateKey, formatShortDay, formatTime, zonedDateTime } from '@/lib/client/format'
import { useAction } from '@/lib/client/use-action'
import { refreshApi, useApi } from '@/lib/client/use-api'
import type { Account, Driver, DriverShift } from './types'

interface DriverDialogProps {
  readonly driver: Driver | null
  readonly onClose: () => void
  readonly onSaved: () => void
}

export function DriverDialog({ driver, onClose, onSaved }: DriverDialogProps) {
  const [name, setName] = useState(driver?.full_name ?? '')
  const [phone, setPhone] = useState(driver?.phone ?? '')
  const [vehicle, setVehicle] = useState(driver?.vehicle_label ?? '')
  const [capacity, setCapacity] = useState(String(driver?.vehicle_capacity ?? 4))
  const [active, setActive] = useState(driver?.is_active ?? true)
  const [login, setLogin] = useState(driver?.profile_id ?? '')
  const logins = useApi<Account[]>('/api/admin/users?role=driver&active=true&limit=200')
  const action = useAction()

  const submit = () =>
    void action.run(async () => {
      const body = {
        full_name: name.trim(),
        vehicle_label: vehicle.trim(),
        vehicle_capacity: Number.parseInt(capacity, 10),
        is_active: active,
        profile_id: login || null,
        ...(phone.trim() ? { phone: phone.replace(/\s+/g, '') } : driver ? { phone: null } : {}),
      }
      await (driver ? apiSend(`/api/admin/drivers/${driver.id}`, 'PATCH', body) : apiSend('/api/admin/drivers', 'POST', body))
      onSaved()
    })

  return (
    <FormDialog
      title={driver ? `Edit ${driver.full_name}` : 'Add driver'}
      submitLabel={driver ? 'Save' : 'Add driver'}
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={unmet([[name.trim() !== '', 'Enter the driver’s name']])}
    >
      <Field label="Name" required>
        <input value={name} onChange={(event) => setName(event.target.value)} data-autofocus />
      </Field>
      <Field label="Phone" hint="International format, for example +2348012345678">
        <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      <Field label="Vehicle">
        <input value={vehicle} onChange={(event) => setVehicle(event.target.value)} placeholder="e.g. Prado SUV" />
      </Field>
      <Field label="Seats for passengers">
        <input type="number" min={1} max={60} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
      </Field>
      <Field label="Login for the driver app" hint="Create the account in Users with the Driver role first">
        <select value={login} onChange={(event) => setLogin(event.target.value)}>
          <option value="">No login</option>
          {(logins.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.full_name} · {account.email}
            </option>
          ))}
        </select>
      </Field>
      <label className="checkbox-field">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Available for pickups
      </label>
    </FormDialog>
  )
}

function eventDays(startsOn: string, endsOn: string): string[] {
  const days: string[] = []
  for (let day = addDays(startsOn, -1); day <= addDays(endsOn, 1); day = addDays(day, 1)) {
    days.push(day)
  }
  return days
}

export function ShiftsDialog({ driver, onClose }: { readonly driver: Driver; readonly onClose: () => void }) {
  const { event } = useSession()
  const timeZone = useTimeZone()
  const path = `/api/admin/driver-shifts?driver_id=${driver.id}&limit=200`
  const shifts = useApi<DriverShift[]>(path)
  const days = event ? eventDays(event.starts_on, event.ends_on) : []
  const [day, setDay] = useState(days[1] ?? days[0] ?? '')
  const [start, setStart] = useState('06:00')
  const [end, setEnd] = useState('14:00')
  const action = useAction()

  const add = () =>
    void action.run(async () => {
      const startsAt = zonedDateTime(day, start, timeZone)
      // A shift that ends "earlier" than it starts runs past midnight.
      const endDay = end <= start ? addDays(day, 1) : day
      await apiSend('/api/admin/driver-shifts', 'POST', { driver_id: driver.id, starts_at: startsAt, ends_at: zonedDateTime(endDay, end, timeZone) })
      await refreshApi('/api/admin/driver-shifts')
    })

  const remove = (shift: DriverShift) =>
    void action.run(async () => {
      await apiSend(`/api/admin/driver-shifts/${shift.id}`, 'DELETE')
      await refreshApi('/api/admin/driver-shifts')
    })

  return (
    <Modal onClose={onClose} scrimClassName="settings-dialog-scrim" className="settings-dialog settings-dialog--wide" labelledBy="shifts-title">
      <header>
        <h2 id="shifts-title">Shifts for {driver.full_name}</h2>
        <p>Times are in the event time zone ({timeZone}). Drivers are only suggested for pickups inside a shift.</p>
      </header>
      <ul className="shift-list">
        {(shifts.data ?? []).length === 0 && <li className="shift-empty">No shifts yet.</li>}
        {(shifts.data ?? []).map((shift) => (
          <li key={shift.id}>
            <span>
              <b>{formatShortDay(shift.starts_at, timeZone)}</b> {formatTime(shift.starts_at, timeZone)}–{formatTime(shift.ends_at, timeZone)}
              {dateKey(shift.ends_at, timeZone) !== dateKey(shift.starts_at, timeZone) && ' (next day)'}
            </span>
            <button type="button" className="icon-button is-danger" aria-label="Delete shift" disabled={action.busy} onClick={() => remove(shift)}>
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="shift-form">
        <Field label="Day">
          <select value={day} onChange={(changeEvent) => setDay(changeEvent.target.value)}>
            {days.map((value) => (
              <option key={value} value={value}>
                {formatShortDay(`${value}T12:00:00Z`, 'UTC')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starts">
          <input type="time" value={start} onChange={(changeEvent) => setStart(changeEvent.target.value)} />
        </Field>
        <Field label="Ends">
          <input type="time" value={end} onChange={(changeEvent) => setEnd(changeEvent.target.value)} />
        </Field>
        <button type="button" className="settings-confirm" disabled={action.busy || !day} onClick={add}>
          Add shift
        </button>
      </div>
      {action.error || shifts.error ? (
        <p className="form-error" role="alert">
          <Icon name="alert" size={16} />
          {action.error ?? errorMessage(shifts.error)}
        </p>
      ) : null}
      <footer>
        <button type="button" className="settings-confirm" onClick={onClose}>
          Done
        </button>
      </footer>
    </Modal>
  )
}
