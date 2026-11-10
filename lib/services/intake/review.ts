// Coordinator side of intake (FR-IN-05, FR-IN-10): read a pasted message, save it as a draft,
// edit a submission, then approve (create records), link to an existing delegation or reject.
// Everything runs as the coordinator, so row-level security applies; AI calls happen outside the
// transaction. A submission is locked while it is decided, so two people cannot approve it twice.
import 'server-only'
import { createHash } from 'node:crypto'
import type { Kysely, Selectable } from 'kysely'
import type { IntakeReader, MessageReading } from '@/lib/ai/intake-reader'
import { ApiError, Errors } from '@/lib/api/errors'
import type { Actor } from '@/lib/auth/session'
import { type Tx, withUser } from '@/lib/db/context'
import type { DB, Delegations, IntakeSubmissions } from '@/lib/db/types'
import type { Extraction } from '@/lib/domain/intake/extraction'
import { LINK_UPDATES, type LinkUpdate, planLinkUpdates } from '@/lib/domain/intake/link-updates'
import { addMember } from '@/lib/services/guests'
import { memberCreateSchema } from '@/lib/validation/guests'
import { normalizeIntake } from '@/lib/domain/intake/normalize'
import { type IntakeFields, MAX_OTHERS_LENGTH, intakeFieldsSchema } from '@/lib/domain/intake/schema'
import { hasBlockingIssues } from '@/lib/domain/intake/validate'
import { assessIntake, createDelegationRecords, extractionColumns, insertSubmission, jsonb, requireEvent } from './records'

const READING_TTL_MS = 10 * 60_000
const MAX_CACHED_READINGS = 200

interface CachedReading {
  readonly at: number
  readonly reading: MessageReading
}

// "Read message" then "Create draft" must not pay for (or differ between) two AI calls.
const readings = new Map<string, CachedReading>()

function readingKey(actorId: string, text: string): string {
  return createHash('sha256').update(`${actorId}\n${text}`).digest('hex')
}

function remember(key: string, reading: MessageReading, now: number): void {
  for (const [cachedKey, cached] of readings) {
    if (now - cached.at > READING_TTL_MS || readings.size >= MAX_CACHED_READINGS) readings.delete(cachedKey)
  }
  readings.set(key, { at: now, reading })
}

export async function readPastedMessage(db: Kysely<DB>, actor: Actor, text: string, reader: IntakeReader, now = Date.now()): Promise<MessageReading> {
  const key = readingKey(actor.id, text)
  const cached = readings.get(key)
  if (cached && now - cached.at <= READING_TTL_MS) return cached.reading
  const event = await withUser(db, actor.id, requireEvent)
  const reading = await reader.readMessage(text, { year: Number(event.starts_on.slice(0, 4)), event_name: event.name })
  remember(key, reading, now)
  return reading
}

export async function createPastedDraft(db: Kysely<DB>, actor: Actor, text: string, reader: IntakeReader) {
  const reading = await readPastedMessage(db, actor, text, reader)
  const fields = intakeFieldsSchema.parse({ ...reading.fields, others: reading.fields.others ?? text.trim().slice(0, MAX_OTHERS_LENGTH) })
  return withUser(db, actor.id, async (tx) => {
    const event = await requireEvent(tx)
    const assessment = await assessIntake(tx, fields, reading.extraction, event)
    return insertSubmission(tx, {
      source: 'pasted_message',
      payload: jsonb({ text }),
      normalized: jsonb(fields),
      ...extractionColumns(reading.extraction),
      issues: jsonb(assessment.issues),
      duplicate_kind: assessment.duplicate.kind,
      matched_delegation_id: assessment.duplicate.delegation_id,
      // A person created it: it is never processed silently (03-App-Flow.md F2).
      is_high_confidence: false,
      status: 'needs_review',
      created_by: actor.id,
    })
  })
}

type SubmissionRow = Selectable<IntakeSubmissions>

async function lockForReview(tx: Tx, id: string): Promise<SubmissionRow> {
  const row = await tx.selectFrom('intake_submissions').selectAll().where('id', '=', id).forUpdate().executeTakeFirst()
  if (!row) throw Errors.notFound('Submission')
  if (row.status !== 'needs_review') {
    throw new ApiError(409, 'already_reviewed', 'This submission has already been decided', { status: row.status })
  }
  return row
}

function storedFields(row: Pick<SubmissionRow, 'normalized'>): IntakeFields {
  return intakeFieldsSchema.parse(row.normalized ?? {})
}

function storedExtraction(row: Pick<SubmissionRow, 'extraction'>): Extraction {
  const value = (row.extraction ?? {}) as Partial<Extraction> & { error?: string | null }
  return { items: value.items ?? [], method: value.method ?? 'none', ...(value.error ? { error: value.error } : {}) }
}

/** Re-reads the free text only when the coordinator changed it (AI calls stay outside the lock). */
async function extractionFor(db: Kysely<DB>, actor: Actor, id: string, fields: IntakeFields | undefined, reader: IntakeReader): Promise<Extraction | null> {
  if (!fields) return null
  const row = await withUser(db, actor.id, (tx) => tx.selectFrom('intake_submissions').select(['normalized', 'extraction']).where('id', '=', id).executeTakeFirst())
  if (!row) throw Errors.notFound('Submission')
  if (storedFields(row).others === fields.others) return null
  const preview = normalizeIntake(fields, 'UTC')
  return reader.readOthers(fields.others, { flight_number: preview.flight_number, party_size: preview.party.length })
}

export async function updateSubmission(db: Kysely<DB>, actor: Actor, id: string, fields: IntakeFields, reader: IntakeReader) {
  const reread = await extractionFor(db, actor, id, fields, reader)
  return withUser(db, actor.id, async (tx) => {
    const row = await lockForReview(tx, id)
    const extraction = reread ?? storedExtraction(row)
    const assessment = await assessIntake(tx, fields, extraction, await requireEvent(tx))
    await tx
      .updateTable('intake_submissions')
      .set({
        normalized: jsonb(fields),
        ...(reread ? extractionColumns(reread) : {}),
        issues: jsonb(assessment.issues),
        duplicate_kind: assessment.duplicate.kind,
        matched_delegation_id: assessment.duplicate.delegation_id,
      })
      .where('id', '=', id)
      .execute()
    return { issues: assessment.issues, duplicate_kind: assessment.duplicate.kind, matched_delegation_id: assessment.duplicate.delegation_id }
  })
}

export interface ApproveInput {
  readonly fields?: IntakeFields
  readonly vip_category_id?: string | null
}

export async function approveSubmission(db: Kysely<DB>, actor: Actor, id: string, input: ApproveInput, reader: IntakeReader) {
  const reread = await extractionFor(db, actor, id, input.fields, reader)
  return withUser(db, actor.id, async (tx) => {
    const row = await lockForReview(tx, id)
    const fields = input.fields ?? storedFields(row)
    const extraction = reread ?? storedExtraction(row)
    const event = await requireEvent(tx)
    const assessment = await assessIntake(tx, fields, extraction, event)
    if (hasBlockingIssues(assessment.issues)) {
      const problems = assessment.issues.filter((issue) => issue.severity === 'error')
      throw new ApiError(400, 'intake_incomplete', 'Fix the highlighted fields before approving', problems)
    }
    const records = await createDelegationRecords(tx, assessment.intake, extraction, { event, submission_id: id, vip_category_id: input.vip_category_id ?? null })
    await tx
      .updateTable('intake_submissions')
      .set({
        status: 'approved',
        delegation_id: records.delegation_id,
        normalized: jsonb(fields),
        ...(reread ? extractionColumns(reread) : {}),
        issues: jsonb(assessment.issues),
        reviewed_by: actor.id,
        reviewed_at: new Date(),
      })
      .where('id', '=', id)
      .execute()
    return records
  })
}

/** Applies the updates the reviewer ticked (F3) through the same writes a coordinator would make. */
async function applyLinkUpdates(tx: Tx, actor: Actor, delegation: Selectable<Delegations>, fields: IntakeFields, chosen: readonly LinkUpdate[]): Promise<LinkUpdate[]> {
  if (chosen.length === 0 || !delegation.principal_guest_id) return []
  const event = await requireEvent(tx)
  const principal = await tx.selectFrom('guests').select(['id', 'dietary']).where('id', '=', delegation.principal_guest_id).forUpdate().executeTakeFirstOrThrow()
  const members = await tx.selectFrom('guests').select('full_name').where('delegation_id', '=', delegation.id).where('member_role', '<>', 'principal').where('status', '<>', 'cancelled').execute()
  const plan = planLinkUpdates(
    { ...delegation, principal_dietary: principal.dietary, member_names: members.map((member) => member.full_name) },
    normalizeIntake(fields, event.timezone),
    chosen,
  )
  if (plan.contact) await tx.updateTable('delegations').set(plan.contact).where('id', '=', delegation.id).execute()
  if (plan.dietary) await tx.updateTable('guests').set({ dietary: plan.dietary }).where('id', '=', principal.id).execute()
  for (const member of plan.newMembers) {
    const input = memberCreateSchema.parse({ full_name: member.name ?? undefined, member_role: member.role, dietary: member.dietary, accessibility: member.accessibility || undefined })
    await addMember(tx, delegation.id, input, actor.id)
  }
  const changed: Record<LinkUpdate, boolean> = { contact: plan.contact !== null, dietary: plan.dietary !== null, companions: plan.newMembers.length > 0 }
  return chosen.filter((update) => changed[update])
}

export async function linkSubmission(db: Kysely<DB>, actor: Actor, id: string, delegationId: string, note: string | null, apply: readonly LinkUpdate[] = []) {
  return withUser(db, actor.id, async (tx) => {
    const row = await lockForReview(tx, id)
    const delegation = await tx.selectFrom('delegations').selectAll().where('id', '=', delegationId).forUpdate().executeTakeFirst()
    if (!delegation) throw Errors.notFound('Delegation')
    const applied = await applyLinkUpdates(tx, actor, delegation, storedFields(row), LINK_UPDATES.filter((update) => apply.includes(update)))
    await tx
      .updateTable('intake_submissions')
      .set({ status: 'linked_duplicate', delegation_id: delegationId, matched_delegation_id: delegationId, review_note: note, reviewed_by: actor.id, reviewed_at: new Date() })
      .where('id', '=', id)
      .execute()
    return { delegation_id: delegation.id, principal_guest_id: delegation.principal_guest_id, applied }
  })
}

export async function rejectSubmission(db: Kysely<DB>, actor: Actor, id: string, note: string | null) {
  return withUser(db, actor.id, async (tx) => {
    await lockForReview(tx, id)
    await tx
      .updateTable('intake_submissions')
      .set({ status: 'rejected', review_note: note, reviewed_by: actor.id, reviewed_at: new Date() })
      .where('id', '=', id)
      .execute()
    return { id }
  })
}

/**
 * Undoes automatic processing (FR-IN-09): deletes the delegation the submission created (its guests,
 * arrival, pickup and notes go with it) and puts the submission back in the review queue.
 */
export async function undoAutoProcessing(db: Kysely<DB>, actor: Actor, id: string) {
  return withUser(db, actor.id, async (tx) => {
    const row = await tx.selectFrom('intake_submissions').select(['status', 'delegation_id']).where('id', '=', id).forUpdate().executeTakeFirst()
    if (!row) throw Errors.notFound('Submission')
    if (row.status !== 'auto_processed' || !row.delegation_id) {
      throw new ApiError(409, 'not_auto_processed', 'Only a submission that was processed automatically can be undone')
    }
    await tx.deleteFrom('delegations').where('id', '=', row.delegation_id).where('created_from_submission_id', '=', id).execute()
    await tx
      .updateTable('intake_submissions')
      .set({ status: 'needs_review', delegation_id: null, review_note: 'Automatic processing undone', reviewed_by: actor.id, reviewed_at: new Date() })
      .where('id', '=', id)
      .execute()
    return { id }
  })
}

/** Manual entry from the Guests screen ("Add guest"): same checks, created by the coordinator. */
export async function createGuestManually(db: Kysely<DB>, actor: Actor, fields: IntakeFields, vipCategoryId: string | null, allowDuplicate: boolean) {
  return withUser(db, actor.id, async (tx) => {
    const event = await requireEvent(tx)
    const extraction: Extraction = { items: [], method: 'none' }
    const assessment = await assessIntake(tx, { ...fields, others: '' }, extraction, event)
    if (hasBlockingIssues(assessment.issues)) {
      throw new ApiError(400, 'intake_incomplete', 'Fix the highlighted fields first', assessment.issues.filter((issue) => issue.severity === 'error'))
    }
    if (assessment.duplicate.kind !== 'none' && !allowDuplicate) {
      throw new ApiError(409, 'possible_duplicate', 'A delegation with similar details already exists', { delegation_id: assessment.duplicate.delegation_id })
    }
    return createDelegationRecords(tx, assessment.intake, extraction, { event, submission_id: null, vip_category_id: vipCategoryId })
  })
}
