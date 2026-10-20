'use client'
// "Add guest" (Figma Guests drawer): the coordinator enters a delegation by hand. Same checks as
// the intake pipeline; a likely duplicate is shown first and needs a second, deliberate click.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { EMPTY_FIELDS, type IntakeFields, type IntakeIssue, fieldMessages } from '@/features/intake/model'
import { ReviewForm } from '@/features/intake/ReviewForm'
import type { VipCategory } from '@/features/settings/types'
import { ApiClientError, apiSend } from '@/lib/client/api'
import { refreshApi } from '@/lib/client/use-api'
import { useAction } from '@/lib/client/use-action'

interface AddGuestDrawerProps {
  readonly categories: readonly VipCategory[]
  readonly onClose: () => void
}

interface Created {
  readonly principal_guest_id: string
}

/** Server field problems ("fields.full_name", or intake issues) as form messages. */
function problemsOf(error: ApiClientError): IntakeIssue[] {
  if (!Array.isArray(error.details)) return []
  return (error.details as { path?: string; field?: string; message: string; code?: string }[]).map((problem) => ({
    code: problem.code ?? 'invalid',
    field: problem.field ?? problem.path?.replace(/^fields\./, ''),
    severity: 'error',
    message: problem.message,
  }))
}

export function AddGuestDrawer({ categories, onClose }: AddGuestDrawerProps) {
  const router = useRouter()
  const toast = useToast()
  const titleId = useId()
  const [fields, setFields] = useState<IntakeFields>(EMPTY_FIELDS)
  const [categoryId, setCategoryId] = useState('')
  const [problems, setProblems] = useState<IntakeIssue[]>([])
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const action = useAction()

  const save = (allowDuplicate: boolean) =>
    action.run(async () => {
      try {
        const created = await apiSend<Created>('/api/guests', 'POST', { fields, vip_category_id: categoryId || null, allow_duplicate: allowDuplicate })
        void refreshApi('/api/guests', '/api/dashboard')
        toast.show({ message: 'Guest added' })
        onClose()
        router.push(`/guests/${created.principal_guest_id}`)
      } catch (error: unknown) {
        if (error instanceof ApiClientError && error.code === 'possible_duplicate') {
          setDuplicateOf((error.details as { delegation_id?: string } | undefined)?.delegation_id ?? null)
          return
        }
        if (error instanceof ApiClientError) setProblems(problemsOf(error))
        throw error
      }
    })

  return (
    <Modal onClose={onClose} as="aside" scrimClassName="drawer-backdrop" className="add-guest-drawer" labelledBy={titleId}>
      <header>
        <div>
          <h2 id={titleId}>Add guest</h2>
          <p>Create a delegation by hand. The same checks as a registration apply.</p>
        </div>
        <button type="button" aria-label="Close drawer" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save(false)
        }}
      >
        <label>
          <span>VIP category</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Decide later</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <ReviewForm
          fields={fields}
          onChange={(next) => {
            setFields(next)
            setDuplicateOf(null)
          }}
          messages={fieldMessages(problems)}
        />
        {duplicateOf && (
          <div className="possible-match" role="alert">
            <Icon name="info" />
            <span>
              A delegation with similar details already exists. <Link href={`/guests/${duplicateOf}`}>Open it</Link> or add this one anyway.
            </span>
            <Button onClick={() => void save(true)} busy={action.busy}>
              Add anyway
            </Button>
          </div>
        )}
        {action.error && (
          <p className="form-error" role="alert">
            <Icon name="alert" size={16} />
            {action.error}
          </p>
        )}
        <div className="drawer-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="primary" type="submit" busy={action.busy}>
            Save guest
          </Button>
        </div>
      </form>
    </Modal>
  )
}
