'use client'
// A change the Co-Pilot prepared (Figma "Suggested" card, FR-CP-04): Approve runs it through the
// same approval as every other proposal (re-checked by the database); Dismiss rejects it.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { errorMessage } from '@/lib/client/api'
import { decideProposal } from '@/lib/client/proposals'
import { refreshApi } from '@/lib/client/use-api'
import type { ProposalCard as Card } from '@/lib/copilot/write-tools'

type State = { readonly kind: 'pending' } | { readonly kind: 'done'; readonly approved: boolean; readonly ok: boolean; readonly message: string }

export function ProposalCard({ proposal }: { readonly proposal: Card }) {
  const [state, setState] = useState<State>({ kind: 'pending' })
  const [busy, setBusy] = useState(false)

  const decide = async (approve: boolean) => {
    setBusy(true)
    try {
      const outcome = await decideProposal(proposal.id, proposal.title, approve)
      setState({ kind: 'done', approved: approve, ok: outcome.ok, message: outcome.message })
    } catch (caught: unknown) {
      setState({ kind: 'done', approved: approve, ok: false, message: errorMessage(caught) })
    } finally {
      setBusy(false)
      await refreshApi('/api/')
    }
  }

  if (state.kind === 'done') {
    return (
      <div className={`copilot-suggestion is-${state.approved && state.ok ? 'approved' : 'dismissed'}`}>
        <h3>{proposal.title}</h3>
        <p className={state.approved && state.ok ? 'copilot-approved' : 'copilot-dismissed'}>
          {state.approved && state.ok ? <Icon name="check" /> : null}
          {state.approved ? state.message : 'Dismissed. Nothing was changed.'}
        </p>
      </div>
    )
  }
  return (
    <div className="copilot-suggestion is-pending">
      <span className="copilot-suggested-chip">
        <Icon name="sparkle" size={13} />
        Suggested
      </span>
      <h3>{proposal.title}</h3>
      {proposal.summary ? (
        <p>
          <b>Details</b>
          <span>{proposal.summary}</span>
        </p>
      ) : null}
      <div>
        <button type="button" className="copilot-approve" disabled={busy} onClick={() => void decide(true)}>
          Approve
        </button>
        <Button disabled={busy} onClick={() => void decide(false)}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
