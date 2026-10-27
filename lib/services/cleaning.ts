// Check-out and cleaning actions (FR-CL-01/05/06). Each runs one database function as the signed-in
// user; the function checks the role, takes the locks and answers conflicts with a hint the API
// turns into a 409 code (already_checked_out, already_started, not_started, cleaning_started, …).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { CleaningProblem } from '@/lib/repositories/cleaning'

/** Housekeeping actions on one task, by their database function. */
const TASK_ACTIONS = {
  start: 'public.start_cleaning',
  complete: 'public.complete_cleaning',
  undoComplete: 'public.undo_complete_cleaning',
  reverseCheckout: 'public.reverse_checkout',
} as const

export type TaskAction = keyof typeof TASK_ACTIONS

async function callJson<T>(tx: Tx, query: ReturnType<typeof sql<{ result: T }>>): Promise<T> {
  const { rows } = await query.execute(tx)
  const result = rows[0]?.result
  if (result === undefined) throw new Error('The database returned no result')
  return result
}

export function runTaskAction(tx: Tx, action: TaskAction, taskId: string): Promise<Record<string, unknown>> {
  return callJson(tx, sql<{ result: Record<string, unknown> }>`select ${sql.raw(TASK_ACTIONS[action])}(${taskId}::uuid) as result`)
}

export function reportProblem(tx: Tx, taskId: string, kind: CleaningProblem, note: string | null): Promise<Record<string, unknown>> {
  return callJson(tx, sql<{ result: Record<string, unknown> }>`select public.report_cleaning_problem(${taskId}::uuid, ${kind}::public.cleaning_problem, ${note}) as result`)
}

export function checkOutParty(tx: Tx, delegationId: string): Promise<{ delegation_id: string; rooms: string[] }> {
  return callJson(tx, sql<{ result: { delegation_id: string; rooms: string[] } }>`select public.check_out_party(${delegationId}::uuid) as result`)
}
