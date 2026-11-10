// Intake queue (FR-IN-10): submissions by review reason, and one submission with what is needed
// to decide it. Runs as the signed-in coordinator; row-level security applies.
import { type RawBuilder, type SqlBool, sql } from 'kysely'
import { Errors } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { Pagination } from '@/lib/validation/common'
import { readDelegationSummary } from './guests'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'

export const INTAKE_TABS = ['review', 'duplicates', 'missing', 'flagged', 'processed', 'rejected'] as const
export type IntakeTab = (typeof INTAKE_TABS)[number]

const FLAG_CODES = ['others_needs_attention', 'others_conflict', 'others_not_read', 'ai_unavailable', 'auto_process_failed']

const NEEDS_REVIEW = sql<SqlBool>`s.status = 'needs_review'`
const HAS_ERROR = sql<SqlBool>`s.issues @> '[{"severity": "error"}]'::jsonb`
const IS_FLAGGED = sql<SqlBool>`exists (
  select 1 from jsonb_array_elements(s.issues) as issue where issue ->> 'code' = any (${FLAG_CODES}::text[])
)`

const TAB_CONDITIONS: Readonly<Record<IntakeTab, RawBuilder<SqlBool>>> = {
  review: NEEDS_REVIEW,
  duplicates: sql<SqlBool>`${NEEDS_REVIEW} and s.duplicate_kind <> 'none'`,
  missing: sql<SqlBool>`${NEEDS_REVIEW} and ${HAS_ERROR}`,
  flagged: sql<SqlBool>`${NEEDS_REVIEW} and ${IS_FLAGGED}`,
  processed: sql<SqlBool>`s.status in ('auto_processed', 'linked_duplicate', 'approved')`,
  rejected: sql<SqlBool>`s.status = 'rejected'`,
}

export interface SubmissionFilters {
  readonly tab: IntakeTab
  readonly search?: string
  readonly source?: 'form' | 'pasted_message'
}

export const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

export async function listSubmissions(tx: Tx, filters: SubmissionFilters, pagination: Pagination) {
  let query = tx.selectFrom('intake_submissions as s').where(TAB_CONDITIONS[filters.tab])
  if (filters.source) query = query.where('s.source', '=', filters.source)
  if (filters.search) {
    const pattern = likePattern(filters.search)
    query = query.where((eb) => eb.or([eb('s.reference_code', 'ilike', pattern), eb(sql<string>`s.normalized ->> 'full_name'`, 'ilike', pattern)]))
  }
  const { total } = await query.select(sql<number>`count(*)::int`.as('total')).executeTakeFirstOrThrow()
  const rows = await query
    .select([
      's.id',
      's.reference_code',
      's.source',
      's.status',
      's.submitted_at',
      's.duplicate_kind',
      's.issues',
      's.delegation_id',
      sql<string>`coalesce(s.normalized ->> 'title', '')`.as('title'),
      sql<string>`coalesce(s.normalized ->> 'full_name', '')`.as('full_name'),
    ])
    .orderBy('s.submitted_at', 'desc')
    .limit(pagination.limit)
    .offset((pagination.page - 1) * pagination.limit)
    .execute()
  return { rows, total }
}

export async function countSubmissionTabs(tx: Tx): Promise<Record<IntakeTab, number>> {
  const row = await tx
    .selectFrom('intake_submissions as s')
    .select(INTAKE_TABS.map((tab) => sql<number>`(count(*) filter (where ${TAB_CONDITIONS[tab]}))::int`.as(tab)))
    .executeTakeFirstOrThrow()
  return row as Record<IntakeTab, number>
}

/** The shared registration link for "Copy registration link" (coordinators may read the event). */
export async function readIntakeLink(tx: Tx): Promise<{ token: string; open: boolean } | null> {
  const row = await tx.selectFrom('events').select(['intake_token as token', 'intake_open as open']).where('id', '=', CURRENT_EVENT_ID).executeTakeFirst()
  return row ?? null
}

export async function getSubmission(tx: Tx, id: string) {
  const row = await tx
    .selectFrom('intake_submissions as s')
    .leftJoin('profiles as creator', 'creator.id', 's.created_by')
    .leftJoin('profiles as reviewer', 'reviewer.id', 's.reviewed_by')
    .select([
      's.id',
      's.reference_code',
      's.source',
      's.status',
      's.submitted_at',
      's.payload',
      's.normalized',
      's.extraction',
      's.issues',
      's.duplicate_kind',
      's.matched_delegation_id',
      's.is_high_confidence',
      's.delegation_id',
      's.ai_model',
      's.ai_input_tokens',
      's.ai_output_tokens',
      's.ai_latency_ms',
      's.reviewed_at',
      's.review_note',
      'creator.full_name as created_by_name',
      'reviewer.full_name as reviewed_by_name',
    ])
    .where('s.id', '=', id)
    .executeTakeFirst()
  if (!row) throw Errors.notFound('Submission')
  const matched = row.matched_delegation_id ? await readDelegationSummary(tx, row.matched_delegation_id) : null
  return { ...row, matched }
}
