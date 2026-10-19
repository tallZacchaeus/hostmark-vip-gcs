'use client'
// Drivers, vehicles and shifts (FR-PL-05). The driver matcher (P3) only proposes active drivers
// inside a shift whose vehicle seats the party.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Pill, Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/client/api'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { ConfirmDelete } from './ConfirmDelete'
import { DriverDialog, ShiftsDialog } from './DriverDialogs'
import type { Driver } from './types'

type Dialog =
  | { readonly type: 'driver'; readonly driver: Driver | null }
  | { readonly type: 'shifts'; readonly driver: Driver }
  | { readonly type: 'delete'; readonly driver: Driver }
  | null

export function DriversTab() {
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const drivers = useApi<Driver[]>('/api/admin/drivers?limit=200')
  const close = () => setDialog(null)
  const saved = (message: string) => {
    close()
    toast.show({ message })
    void refreshApi('/api/admin/drivers')
  }

  return (
    <div className="settings-section">
      <section className="data-card" aria-labelledby="drivers-title">
        <header>
          <div>
            <h2 id="drivers-title">Drivers</h2>
            <p>{drivers.meta ? `${drivers.meta.total} drivers` : 'Loading…'}</p>
          </div>
          <div>
            <Button kind="primary" icon="plus" onClick={() => setDialog({ type: 'driver', driver: null })}>
              Add driver
            </Button>
          </div>
        </header>
        {drivers.error ? <ErrorBanner className="settings-error" message={errorMessage(drivers.error)} onRetry={() => void drivers.mutate()} /> : null}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Vehicle</th>
                <th className="num">Seats</th>
                <th>App login</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(drivers.data ?? []).map((driver) => (
                <tr key={driver.id} className={driver.is_active ? '' : 'is-muted'}>
                  <td>{driver.full_name}</td>
                  <td>{driver.phone ?? '—'}</td>
                  <td>{driver.vehicle_label ?? '—'}</td>
                  <td className="num">{driver.vehicle_capacity}</td>
                  <td>{driver.profile_id ? 'Linked' : '—'}</td>
                  <td>
                    <Pill tone={driver.is_active ? 'success' : 'neutral'}>{driver.is_active ? 'Available' : 'Inactive'}</Pill>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button kind="ghost" icon="calendarClock" onClick={() => setDialog({ type: 'shifts', driver })}>
                        Shifts
                      </Button>
                      <button type="button" className="icon-button" aria-label={`Edit ${driver.full_name}`} onClick={() => setDialog({ type: 'driver', driver })}>
                        <Icon name="edit" size={17} />
                      </button>
                      <button type="button" className="icon-button is-danger" aria-label={`Delete ${driver.full_name}`} onClick={() => setDialog({ type: 'delete', driver })}>
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {drivers.isLoading && <Skeleton className="sk-wide" />}
        </div>
      </section>
      {dialog?.type === 'driver' && <DriverDialog driver={dialog.driver} onClose={close} onSaved={() => saved('Driver saved.')} />}
      {dialog?.type === 'shifts' && <ShiftsDialog driver={dialog.driver} onClose={close} />}
      {dialog?.type === 'delete' && (
        <ConfirmDelete
          label={dialog.driver.full_name}
          path={`/api/admin/drivers/${dialog.driver.id}`}
          onClose={close}
          onDeleted={() => saved(`${dialog.driver.full_name} was deleted.`)}
        />
      )}
    </div>
  )
}
