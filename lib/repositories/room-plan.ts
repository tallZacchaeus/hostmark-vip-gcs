// One room plan for review (FR-RA-04, Figma "Allocation plan"): the summary and every line with
// its guest, room, why, preference match and rules — and, once decided, which lines were applied.
// Runs as the coordinator (RLS applies).
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'

export type LineStatus = 'pending' | 'approved' | 'rejected' | 'failed' | 'superseded' | 'expired'

export interface PlanLineView {
  readonly id: string
  readonly status: LineStatus
  readonly error: string | null
  readonly guest: { readonly id: string; readonly name: string; readonly role: string; readonly delegation: string; readonly is_principal: boolean }
  readonly room: { readonly id: string; readonly number: string; readonly type: string; readonly wing: string; readonly floor: number }
  readonly why: string
  readonly match: 'High' | 'Partial' | 'Low'
  readonly meets_all: boolean
  readonly preferences: { readonly code: string; readonly status: 'met' | 'partly' | 'missed'; readonly text: string }[]
}

export interface PlanView {
  readonly id: string
  readonly status: LineStatus
  readonly title: string
  readonly created_at: string
  readonly decided_at: string | null
  readonly decided_by: string | null
  readonly satisfaction: number
  readonly placed: number
  readonly unplaced: number
  readonly meets_all: number
  readonly warnings: number
  readonly unplaced_guests: { readonly guest_id: string; readonly name: string; readonly delegation: string; readonly reason: string | null }[]
  readonly lines: PlanLineView[]
}

interface LineRationale {
  readonly why?: string
  readonly match?: PlanLineView['match']
  readonly meets_all?: boolean
  readonly preferences?: PlanLineView['preferences']
  readonly guest?: Omit<PlanLineView['guest'], 'id'>
  readonly room?: Omit<PlanLineView['room'], 'id'>
}

export async function loadRoomPlan(tx: Tx, planId: string): Promise<PlanView> {
  const plan = await tx
    .selectFrom('proposals as p')
    .leftJoin('profiles as decider', 'decider.id', 'p.decided_by')
    .select(['p.id', 'p.status', 'p.title', 'p.created_at', 'p.decided_at', 'p.rationale', 'decider.full_name as decided_by'])
    .where('p.id', '=', planId)
    .where('p.kind', '=', 'room_plan')
    .executeTakeFirst()
  if (!plan) throw new ApiError(404, 'not_found', 'Room plan not found')
  const lines = await tx
    .selectFrom('proposals')
    .select(['id', 'status', 'execution_error', 'payload', 'rationale'])
    .where('parent_id', '=', planId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const summary = plan.rationale as { satisfaction?: number; placed?: number; unplaced?: number; meets_all?: number; warnings?: number; unplaced_guests?: PlanView['unplaced_guests'] }
  return {
    id: plan.id,
    status: plan.status as LineStatus,
    title: plan.title,
    created_at: new Date(plan.created_at).toISOString(),
    decided_at: plan.decided_at ? new Date(plan.decided_at).toISOString() : null,
    decided_by: plan.decided_by ?? null,
    satisfaction: summary.satisfaction ?? 0,
    placed: summary.placed ?? lines.length,
    unplaced: summary.unplaced ?? 0,
    meets_all: summary.meets_all ?? 0,
    warnings: summary.warnings ?? 0,
    unplaced_guests: summary.unplaced_guests ?? [],
    lines: lines.map((line) => {
      const payload = line.payload as { guest_id: string; room_id: string }
      const rationale = line.rationale as LineRationale
      return {
        id: line.id,
        status: line.status as LineStatus,
        error: line.execution_error,
        guest: { id: payload.guest_id, name: rationale.guest?.name ?? 'Guest', role: rationale.guest?.role ?? '', delegation: rationale.guest?.delegation ?? '', is_principal: rationale.guest?.is_principal ?? false },
        room: { id: payload.room_id, number: rationale.room?.number ?? '?', type: rationale.room?.type ?? '', wing: rationale.room?.wing ?? '', floor: rationale.room?.floor ?? 0 },
        why: rationale.why ?? '',
        match: rationale.match ?? 'High',
        meets_all: rationale.meets_all ?? true,
        preferences: rationale.preferences ?? [],
      }
    }),
  }
}
