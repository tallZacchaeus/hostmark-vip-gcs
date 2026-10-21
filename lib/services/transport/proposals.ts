// Planned transport decisions become proposals (PRD principle P1): one per pickup, which
// supersedes older pending ones for the same pickup. vip_system only.
import type { Tx } from '@/lib/db/context'
import type { PlannedProposal } from '@/lib/domain/transport/cascade'
import type { MatchDriver } from '@/lib/domain/transport/matcher'
import { type Trigger, createProposal } from '@/lib/services/proposals'

export type { Trigger } from '@/lib/services/proposals'

export async function createDriverProposal(
  tx: Tx,
  proposal: PlannedProposal,
  pickupId: string,
  drivers: readonly MatchDriver[],
  trigger: Trigger | null,
): Promise<string> {
  const name = (id: string): string => drivers.find((driver) => driver.id === id)?.full_name ?? 'a driver'
  const payload = proposal.kind === 'release_pickup' ? { pickup_id: pickupId } : { pickup_id: pickupId, driver_ids: proposal.driver_ids }
  return createProposal(tx, {
    kind: proposal.kind,
    title: proposal.title,
    summary: proposal.summary,
    payload,
    rationale: {
      reason: proposal.summary,
      also_changes: proposal.also_changes ?? null,
      alternatives: proposal.alternatives.map(name),
      alternative_driver_ids: proposal.alternatives,
    },
    target_type: 'pickups',
    target_id: pickupId,
    trigger,
  })
}
