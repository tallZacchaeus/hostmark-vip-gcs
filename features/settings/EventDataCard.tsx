'use client'
// Event data (Super Admin, PRD §3 "data export/purge"): download the operational data as JSON, and
// after the event remove guest personal data (TRD §7 Privacy). The API enforces both rules; the
// card only explains them and asks for the event name before a purge.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Field, FormDialog } from '@/components/ui/FormDialog'
import { useToast } from '@/components/ui/Toast'
import { useSession } from '@/components/shell/SessionContext'
import { ApiClientError, apiSend } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'
import { zonedDateKey } from '@/lib/domain/time'
import type { EventSettings } from './types'

const EXPORT_PATH = '/api/admin/data/export'
const PURGE_PATH = '/api/admin/data/purge'
const FALLBACK_FILE_NAME = 'event-export.json'

type EventDates = Pick<EventSettings, 'name' | 'timezone' | 'ends_on'>

interface EventDataCardProps {
  readonly event: EventDates
}

const sameName = (typed: string, name: string): boolean => typed.trim().toLowerCase() === name.trim().toLowerCase()

/** "2026-10-31" → "31 October 2026". */
function longDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function fileNameFrom(disposition: string | null): string {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? FALLBACK_FILE_NAME
}

/** Reads the error envelope of a failed download into the same error the API client throws. */
async function downloadError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } }
    if (body.error?.message) return new ApiClientError(response.status, body.error.code ?? 'unknown_error', body.error.message)
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return new ApiClientError(response.status, 'unexpected_response', 'The export could not be downloaded. Try again in a moment.')
}

async function downloadExport(): Promise<void> {
  let response: Response
  try {
    // POST: the export writes an audit entry, and the API checks the Origin of cookie POSTs (CSRF).
    response = await fetch(EXPORT_PATH, { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new ApiClientError(0, 'offline', 'Could not reach the server. Check your connection and try again.')
  }
  if (!response.ok) throw await downloadError(response)
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = fileNameFrom(response.headers.get('content-disposition'))
  link.click()
  URL.revokeObjectURL(url)
}

interface PurgeDialogProps {
  readonly eventName: string
  readonly onClose: () => void
  readonly onPurged: () => void
}

function PurgeDialog({ eventName, onClose, onPurged }: PurgeDialogProps) {
  const [typed, setTyped] = useState('')
  const action = useAction()
  const submit = () =>
    void action.run(async () => {
      await apiSend(PURGE_PATH, 'POST', { confirmation: typed.trim() })
      onPurged()
    })

  return (
    <FormDialog
      title="Remove guest personal data?"
      description="Names become “Guest” with a short code; contact details, dietary and accessibility notes, requirements, registration forms and questions asked to Victoria are deleted. Names, e-mail addresses and phone numbers are also taken out of titles and notes, on a best effort basis (a nickname or misspelling may remain). Times, rooms, flights and counts stay for reporting. This cannot be undone, so download an export first if you need one."
      submitLabel="Remove personal data"
      width="compact"
      danger
      canSubmit={sameName(typed, eventName)}
      busy={action.busy}
      error={action.error}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label={`Type the event name (${eventName}) to confirm`} required>
        <input value={typed} onChange={(change) => setTyped(change.target.value)} autoComplete="off" data-autofocus />
      </Field>
    </FormDialog>
  )
}

export function EventDataCard({ event }: EventDataCardProps) {
  const toast = useToast()
  const { user } = useSession()
  const download = useAction()
  const [confirming, setConfirming] = useState(false)

  if (user.role !== 'super_admin') return null
  const ended = zonedDateKey(new Date(), event.timezone) > event.ends_on

  const exportData = () =>
    void download.run(async () => {
      await downloadExport()
      toast.show({ message: 'Export downloaded.' })
    })

  return (
    <>
      <section className="data-card" aria-labelledby="event-data-title">
        <header>
          <div>
            <h2 id="event-data-title">Event data</h2>
            <p>Download guests, arrivals, pickups, rooms, programme and cleaning as a JSON file. Each export is recorded in Activity.</p>
          </div>
          <div>
            <Button icon="file" busy={download.busy} onClick={exportData}>
              Download export
            </Button>
          </div>
        </header>
        {download.error && <ErrorBanner className="settings-error" message={download.error} />}
      </section>
      <section className="data-card" aria-labelledby="event-purge-title">
        <header>
          <div>
            <h2 id="event-purge-title">Guest personal data</h2>
            <p>
              {ended
                ? 'The event is over. Remove guest names, contact details and notes, keeping the figures for reporting.'
                : `Available after the event ends on ${longDate(event.ends_on)}.`}
            </p>
          </div>
          <div>
            <Button icon="trash" disabled={!ended} onClick={() => setConfirming(true)}>
              Remove guest personal data
            </Button>
          </div>
        </header>
        {confirming && (
          <PurgeDialog
            eventName={event.name}
            onClose={() => setConfirming(false)}
            onPurged={() => {
              setConfirming(false)
              toast.show({ message: 'Guest personal data removed.' })
            }}
          />
        )}
      </section>
    </>
  )
}
