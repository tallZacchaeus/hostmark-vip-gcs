// Audit log (FR-PL-07), notifications (FR-PL-08) and the decisions queue (FR-PL-09).
// All queries run as the signed-in user, so row-level security limits what they return.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { Pagination } from '@/lib/validation/common'

const offsetOf = (pagination: Pagination): number => (pagination.page - 1) * pagination.limit

export interface AuditFilters {
  readonly entity_type?: string
  readonly entity_types?: readonly string[]
  readonly actor_type?: 'user' | 'system' | 'copilot' | 'guest_intake'
  readonly entity_id?: string
  readonly actor_id?: string
  readonly automatic?: boolean
  readonly from?: string
  readonly to?: string
}

export async function listAuditEntries(tx: Tx, filters: AuditFilters, pagination: Pagination) {
  let query = tx.selectFrom('audit_log as a')
  if (filters.entity_type) query = query.where('a.entity_type', '=', filters.entity_type)
  if (filters.entity_types) query = query.where('a.entity_type', 'in', [...filters.entity_types])
  if (filters.actor_type) query = query.where('a.actor_type', '=', filters.actor_type)
  if (filters.entity_id) query = query.where('a.entity_id', '=', filters.entity_id)
  if (filters.actor_id) query = query.where('a.actor_id', '=', filters.actor_id)
  if (filters.automatic !== undefined) query = query.where('a.is_automatic', '=', filters.automatic)
  if (filters.from) query = query.where('a.occurred_at', '>=', new Date(filters.from))
  if (filters.to) query = query.where('a.occurred_at', '<', new Date(filters.to))

  const { total } = await query.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow()
  const rows = await query
    .leftJoin('profiles as p', 'p.id', 'a.actor_id')
    .select([
      'a.id',
      'a.occurred_at',
      'a.actor_type',
      'a.actor_id',
      'p.full_name as actor_name',
      'a.action',
      'a.entity_type',
      'a.entity_id',
      'a.before',
      'a.after',
      'a.reason',
      'a.proposal_id',
      'a.is_automatic',
      'a.undoable',
      'a.undo_of_audit_id',
    ])
    .select((eb) =>
      eb
        .exists(eb.selectFrom('audit_log as u').select('u.id').whereRef('u.undo_of_audit_id', '=', 'a.id'))
        .as('undone'),
    )
    .orderBy('a.id', 'desc')
    .limit(pagination.limit)
    .offset(offsetOf(pagination))
    .execute()
  return { rows, total: Number(total) }
}

export async function undoAuditEntry(tx: Tx, auditId: string, reason: string | null) {
  const { rows } = await sql<{ result: Record<string, unknown> }>`
    select public.undo_audit_entry(${auditId}::bigint, ${reason}) as result`.execute(tx)
  return rows[0]?.result
}

export async function listNotifications(tx: Tx, recipientId: string, unreadOnly: boolean, pagination: Pagination) {
  let query = tx.selectFrom('notifications').where('recipient_id', '=', recipientId)
  if (unreadOnly) query = query.where('read_at', 'is', null)

  const [{ total }, { unread }] = await Promise.all([
    query.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
    tx
      .selectFrom('notifications')
      .where('recipient_id', '=', recipientId)
      .where('read_at', 'is', null)
      .select((eb) => eb.fn.countAll<string>().as('unread'))
      .executeTakeFirstOrThrow(),
  ])
  const rows = await query
    .select(['id', 'kind', 'priority', 'title', 'body', 'entity_type', 'entity_id', 'created_at', 'read_at'])
    .orderBy('created_at', 'desc')
    .limit(pagination.limit)
    .offset(offsetOf(pagination))
    .execute()
  return { rows, total: Number(total), unread: Number(unread) }
}

export async function markNotificationsRead(tx: Tx, recipientId: string, ids?: readonly string[]): Promise<number> {
  let query = tx
    .updateTable('notifications')
    .set({ read_at: sql`now()` })
    .where('recipient_id', '=', recipientId)
    .where('read_at', 'is', null)
  if (ids) query = query.where('id', 'in', [...ids])
  const result = await query.executeTakeFirst()
  return Number(result.numUpdatedRows)
}

export async function listPendingDecisions(tx: Tx, pagination: Pagination) {
  // Expired proposals are hidden even before an approval attempt marks them expired.
  const query = tx
    .selectFrom('proposals as p')
    .where('p.status', '=', 'pending')
    .where('p.parent_id', 'is', null)
    .where((eb) => eb.or([eb('p.expires_at', 'is', null), eb('p.expires_at', '>', sql<Date>`now()`)]))
  const { total } = await query.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow()
  const rows = await query
    .select([
      'p.id',
      'p.kind',
      'p.title',
      'p.summary',
      'p.rationale',
      'p.target_type',
      'p.target_id',
      'p.created_by_type',
      'p.created_at',
      'p.expires_at',
    ])
    .select((eb) =>
      eb
        .selectFrom('proposals as line')
        .whereRef('line.parent_id', '=', 'p.id')
        .select((inner) => inner.fn.countAll<string>().as('n'))
        .as('line_count'),
    )
    .orderBy(sql`p.expires_at asc nulls last`)
    .orderBy('p.created_at', 'asc')
    .limit(pagination.limit)
    .offset(offsetOf(pagination))
    .execute()
  return { rows, total: Number(total) }
}

export async function decideProposal(
  tx: Tx,
  proposalId: string,
  decision: { readonly approve: true; readonly lineIds?: readonly string[] } | { readonly approve: false; readonly note: string | null },
) {
  const statement = decision.approve
    ? sql<{ result: Record<string, unknown> }>`
        select public.approve_proposal(${proposalId}::uuid, ${decision.lineIds ? [...decision.lineIds] : null}::uuid[]) as result`
    : sql<{ result: Record<string, unknown> }>`
        select public.reject_proposal(${proposalId}::uuid, ${decision.note}) as result`
  const { rows } = await statement.execute(tx)
  return rows[0]?.result
}
