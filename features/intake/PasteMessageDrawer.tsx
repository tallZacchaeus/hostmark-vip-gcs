'use client'
// "Paste a message" (FR-IN-05, F2): read a forwarded message, show what was found, what is
// missing and what is uncertain, then save it as a draft for Review. Nothing creates a guest here.
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { fieldLabel } from '@/lib/client/activity-format'
import { apiSend } from '@/lib/client/api'
import { refreshApi } from '@/lib/client/use-api'
import { useAction } from '@/lib/client/use-action'
import { requiredFieldProblems } from '@/lib/domain/intake/schema'
import { ARRIVAL_MODE_LABELS, type ExtractedItem, type IntakeFields, completeFields } from './model'

const MAX_MESSAGE_LENGTH = 4000

interface Reading {
  readonly fields: Partial<IntakeFields>
  readonly extraction: { readonly items: ExtractedItem[]; readonly method: string; readonly error?: string }
}

function suggestedRows(fields: IntakeFields): [string, string][] {
  const rows: [string, string | undefined][] = [
    ['Title', fields.title],
    ['Full name', fields.full_name],
    ['Arrival mode', fields.arrival_mode ? ARRIVAL_MODE_LABELS[fields.arrival_mode] : undefined],
    ['Flight number', fields.flight_number],
    ['Arrival date', fields.arrival_date],
    ['Arrival time', fields.arrival_time],
    ['Dietary', fields.dietary],
    ['Travelling with', fields.party.length ? `${fields.party.length} ${fields.party.length === 1 ? 'person' : 'people'}` : undefined],
  ]
  return rows.filter((row): row is [string, string] => Boolean(row[1]))
}

function ReadResult({ reading }: { readonly reading: Reading }) {
  const fields = completeFields(reading.fields)
  const suggested = suggestedRows(fields)
  const missing = [...new Set(requiredFieldProblems(fields).map((problem) => problem.path))]
  const unnamed = fields.party.filter((member) => !member.name).length
  const uncertain = reading.extraction.items.filter((item) => item.needs_attention || item.conflicts_with)
  return (
    <section className="read-result" aria-label="What was read">
      <h3>What was read</h3>
      {reading.extraction.error && (
        <p className="read-note" role="note">
          The AI could not read this message, so a basic reader was used. Check the draft carefully.
        </p>
      )}
      {suggested.length > 0 && (
        <div className="read-group read-group--suggested">
          <h4>
            <Icon name="sparkle" />
            Suggested
          </h4>
          {suggested.map(([label, value]) => (
            <p key={label}>
              <b>{label}</b>
              <span>{value}</span>
            </p>
          ))}
        </div>
      )}
      {(missing.length > 0 || unnamed > 0) && (
        <div className="read-group read-group--missing">
          <h4>
            <Icon name="alert" />
            Missing
          </h4>
          {missing.map((path) => (
            <p key={path}>
              <b>{fieldLabel(path)}</b>
              <span>Not found</span>
            </p>
          ))}
          {unnamed > 0 && (
            <p>
              <b>Companions</b>
              <span>
                Names of {unnamed} {unnamed === 1 ? 'person' : 'people'}
              </span>
            </p>
          )}
        </div>
      )}
      {uncertain.length > 0 && (
        <div className="read-group read-group--uncertain">
          <h4>
            <Icon name="alert" />
            Uncertain
          </h4>
          {uncertain.map((item) => (
            <p key={item.detail}>
              <b>{item.conflicts_with ? `Contradicts ${item.conflicts_with.replace(/_/g, ' ')}` : 'Source phrase'}</b>
              <span>{item.detail}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

export function PasteMessageDrawer({ onClose }: { readonly onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const titleId = useId()
  const [message, setMessage] = useState('')
  const [reading, setReading] = useState<Reading | null>(null)
  const read = useAction()
  const create = useAction()

  const readMessage = () =>
    read.run(async () => {
      setReading(await apiSend<Reading>('/api/intake/read-message', 'POST', { text: message }))
    })
  const createDraft = () =>
    create.run(async () => {
      const draft = await apiSend<{ id: string; reference_code: string }>('/api/intake/submissions', 'POST', { text: message })
      void refreshApi('/api/intake', '/api/dashboard')
      toast.show({ message: `Draft ${draft.reference_code} sent to Review` })
      onClose()
      router.push(`/intake/${draft.id}`)
    })

  return (
    <Modal onClose={onClose} as="aside" scrimClassName="intake-drawer-overlay" className="intake-drawer" labelledBy={titleId}>
      <header>
        <h2 id={titleId}>Paste a message</h2>
        <button type="button" aria-label="Close drawer" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="intake-drawer-body">
        <label>
          <span>Message</span>
          <textarea
            value={message}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(event) => {
              setMessage(event.target.value)
              setReading(null)
            }}
            placeholder="Paste a WhatsApp message or an email here"
            data-autofocus
          />
        </label>
        <Button kind="primary" onClick={readMessage} disabled={message.trim().length < 10} busy={read.busy}>
          {read.busy ? 'Reading message…' : 'Read message'}
        </Button>
        {(read.error ?? create.error) && (
          <p className="form-error" role="alert">
            <Icon name="alert" size={16} />
            {read.error ?? create.error}
          </p>
        )}
        {reading && <ReadResult reading={reading} />}
      </div>
      {reading && (
        <footer className="intake-drawer-footer">
          <div>
            <Button kind="primary" onClick={createDraft} busy={create.busy}>
              Create draft
            </Button>
            <Button
              kind="ghost"
              onClick={() => {
                setMessage('')
                setReading(null)
              }}
            >
              Clear
            </Button>
          </div>
          <small>No guest is created until you approve it in Review.</small>
        </footer>
      )}
    </Modal>
  )
}
