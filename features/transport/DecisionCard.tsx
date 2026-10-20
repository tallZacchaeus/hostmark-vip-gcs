'use client'
// One pending driver decision (Figma "Transport" decision cards): what the system suggests and
// why, the alternatives, and one-tap Approve or Reject (PRD principle P1). Hovering links the
// card to its ghost block on the board.
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import type { BoardDecision } from './model'

interface DecisionCardProps {
  readonly decision: BoardDecision
  readonly busy: boolean
  readonly hovered: boolean
  readonly onHover: (proposalId: string | null) => void
  readonly onDecide: (decision: BoardDecision, approve: boolean) => void
}

const ICONS = { driver_assignment: 'userPlus', driver_reassignment: 'swap', release_pickup: 'x' } as const

export function DecisionCard({ decision, busy, hovered, onHover, onDecide }: DecisionCardProps) {
  const icon = ICONS[decision.kind as keyof typeof ICONS] ?? 'car'
  return (
    <article
      className={`transport-decision ${hovered ? 'is-hovered' : ''}`}
      onMouseEnter={() => onHover(decision.proposal_id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(decision.proposal_id)}
      onBlur={() => onHover(null)}
      aria-label={decision.title}
    >
      <span className="decision-icon">
        <Icon name={icon} />
      </span>
      <div className="decision-copy">
        <h2>{decision.title}</h2>
        {decision.summary && <p>{decision.summary}</p>}
        {decision.also_changes && <p className="decision-also">Also changes: {decision.also_changes}</p>}
        {decision.alternatives.length > 0 && (
          <div className="also-available">
            <span>Also available</span>
            {decision.alternatives.map((name) => (
              <b key={name}>{name}</b>
            ))}
          </div>
        )}
        <div className="decision-actions">
          <button type="button" className="transport-approve" disabled={busy} onClick={() => onDecide(decision, true)}>
            {busy ? 'Working…' : 'Approve'}
          </button>
          <Button disabled={busy} onClick={() => onDecide(decision, false)}>
            Reject
          </Button>
        </div>
      </div>
      <span className="decision-suggested">
        <Icon name="sparkle" size={13} />
        Suggested
      </span>
    </article>
  )
}
