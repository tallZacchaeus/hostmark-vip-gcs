// Every suggestion the system makes becomes a proposal (PRD principle P1) through
// private.create_proposal: it supersedes older pending proposals for the same target (unless it
// is a line of a plan) and tells the coordinators. vip_system only.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { ProposalKind } from '@/lib/db/types'

export interface Trigger {
  readonly type: string
  readonly id: string
}

export interface NewProposal {
  readonly kind: ProposalKind
  readonly title: string
  readonly summary?: string | null
  readonly payload: Record<string, unknown>
  readonly rationale?: Record<string, unknown>
  readonly target_type: string
  readonly target_id: string
  readonly trigger?: Trigger | null
  /** The plan this proposal is a line of. */
  readonly parent_id?: string | null
}

export async function createProposal(tx: Tx, proposal: NewProposal): Promise<string> {
  const { rows } = await sql<{ id: string }>`select private.create_proposal(
    p_kind => ${proposal.kind}::public.proposal_kind,
    p_title => ${proposal.title},
    p_payload => ${JSON.stringify(proposal.payload)}::jsonb,
    p_created_by_type => 'system',
    p_summary => ${proposal.summary ?? null},
    p_rationale => ${JSON.stringify(proposal.rationale ?? {})}::jsonb,
    p_target_type => ${proposal.target_type},
    p_target_id => ${proposal.target_id}::uuid,
    p_trigger_type => ${proposal.trigger?.type ?? null},
    p_trigger_id => ${proposal.trigger?.id ?? null},
    p_parent_id => ${proposal.parent_id ?? null}::uuid
  ) as id`.execute(tx)
  const id = rows[0]?.id
  if (!id) throw new Error('create_proposal returned no id')
  return id
}
