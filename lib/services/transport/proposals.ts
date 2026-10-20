// Planned transport decisions become proposals (PRD principle P1): one per pickup, through
// private.create_proposal, which supersedes older pending ones for the same pickup and tells the
// coordinators. vip_system only.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { PlannedProposal } from '@/lib/domain/transport/cascade'
import type { MatchDriver } from '@/lib/domain/transport/matcher'

export interface Trigger {
  readonly type: string
  readonly id: string
}

export async function createDriverProposal(
  tx: Tx,
  proposal: PlannedProposal,
  pickupId: string,
  drivers: readonly MatchDriver[],
  trigger: Trigger | null,
): Promise<string> {
  const name = (id: string): string => drivers.find((driver) => driver.id === id)?.full_name ?? 'a driver'
  const payload = proposal.kind === 'release_pickup' ? { pickup_id: pickupId } : { pickup_id: pickupId, driver_ids: proposal.driver_ids }
  const rationale = {
    reason: proposal.summary,
    also_changes: proposal.also_changes ?? null,
    alternatives: proposal.alternatives.map(name),
    alternative_driver_ids: proposal.alternatives,
  }
  const { rows } = await sql<{ id: string }>`select private.create_proposal(
    p_kind => ${proposal.kind}::public.proposal_kind,
    p_title => ${proposal.title},
    p_payload => ${JSON.stringify(payload)}::jsonb,
    p_created_by_type => 'system',
    p_summary => ${proposal.summary},
    p_rationale => ${JSON.stringify(rationale)}::jsonb,
    p_target_type => 'pickups',
    p_target_id => ${pickupId}::uuid,
    p_trigger_type => ${trigger?.type ?? null},
    p_trigger_id => ${trigger?.id ?? null}
  ) as id`.execute(tx)
  const id = rows[0]?.id
  if (!id) throw new Error('create_proposal returned no id')
  return id
}
