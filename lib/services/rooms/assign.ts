// A manual assignment or move (FR-RA-06). When it breaks a hard rule or loses a preference the
// coordinator must acknowledge each one the warning showed and say why ("assign anyway"); the
// reason and the rules go to the stay and the activity log. If something changed since the dialog
// was shown (a new broken rule, a new loss), the answer is a fresh 409 with what is true now. Runs
// as the coordinator: public.assign_room re-checks the hard rules and refuses an unacknowledged
// violation or a short reason whatever this layer decided.
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { MIN_OVERRIDE_REASON } from '@/lib/validation/rooms'
import { type MoveCheck, checkMove } from './check'

export interface AssignResult {
  readonly assignment_id: string
  readonly room_number: string
  readonly violations: string[]
}

export interface AssignRequest {
  readonly guestId: string
  readonly roomId: string
  readonly reason: string | null
  /** Codes of the broken rules and lost preferences the coordinator saw and accepted. */
  readonly acknowledged: readonly string[]
}

const warningCodes = (check: MoveCheck): string[] => [...check.violations.map((violation) => violation.code), ...check.losses.map((loss) => loss.code)]

export async function assignRoom(tx: Tx, request: AssignRequest, now: Date): Promise<AssignResult> {
  const check = await checkMove(tx, request.guestId, request.roomId, now)
  const reason = request.reason?.trim() || null
  const unseen = warningCodes(check).filter((code) => !request.acknowledged.includes(code))
  if (check.needs_confirmation && (!reason || reason.length < MIN_OVERRIDE_REASON || unseen.length > 0)) {
    throw new ApiError(409, 'needs_confirmation', `This move breaks a rule or loses a preference; acknowledge each one and give a reason of at least ${MIN_OVERRIDE_REASON} characters`, {
      violations: check.violations,
      losses: check.losses,
    })
  }
  const { rows } = await sql<{ result: AssignResult }>`
    select public.assign_room(${request.guestId}::uuid, ${request.roomId}::uuid, ${reason}, ${[...request.acknowledged]}::text[]) as result`.execute(tx)
  const result = rows[0]?.result
  if (!result) throw new Error('assign_room returned nothing')
  return result
}
