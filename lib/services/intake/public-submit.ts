// Public registration (FR-IN-01…03, 09): link check → per-IP limit (Postgres) → bot check →
// read the free text → one vip_system transaction that stores the submission and either links an
// exact duplicate, creates the records (high confidence) or queues it for review. The guest only
// ever learns their reference code: nothing about other registrations is revealed (FR-IN-02).
import 'server-only'
import { createHmac } from 'node:crypto'
import { type Kysely, sql } from 'kysely'
import type { IntakeReader } from '@/lib/ai/intake-reader'
import { ApiError, Errors } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { inSystemEvent, withSystem } from '@/lib/db/system'
import type { DB } from '@/lib/db/types'
import { EMPTY_EXTRACTION, type Extraction } from '@/lib/domain/intake/extraction'
import { displayName, normalizeIntake } from '@/lib/domain/intake/normalize'
import type { ArrivalMode, PublicRegistration } from '@/lib/domain/intake/schema'
import { logger } from '@/lib/logger'
import type { Mailer } from '@/lib/mail/mailer'
import type { BotCheck } from '@/lib/security/turnstile'
import {
  type IntakeEvent,
  assessIntake,
  createDelegationRecords,
  extractionColumns,
  jsonb,
  loadEvent,
  insertSubmission,
  notifyCoordinators,
} from './records'
import { sendRegistrationConfirmation } from './confirmation-email'

/** Registrations accepted per client IP (hashed) per window, across all link visits. */
export const INTAKE_IP_LIMIT = { windowMs: 15 * 60_000, max: 10 } as const

export interface PublicIntakeDeps {
  readonly db: Kysely<DB>
  readonly reader: IntakeReader
  readonly botCheck: BotCheck
  /** Keys the IP hash, so raw addresses are never stored. */
  readonly ipHashSecret: string
  /** Emails the guest a confirmation when given (and enabled). */
  readonly mailer?: Mailer
  readonly now?: () => Date
}

export interface LinkContext {
  readonly open: boolean
  readonly event_name: string
  readonly venue_name: string
  readonly timezone: string
  readonly starts_on: string
  readonly ends_on: string
  /** Days before the start and after the end that guests may travel (travel-window.ts). */
  readonly intake_window_days: number
}

export interface RegistrationReceipt {
  readonly reference_code: string
  /** True when a coordinator will check something before confirming ("We may contact you"). */
  readonly follow_up: boolean
  readonly summary: {
    readonly guest: string
    readonly companions: number
    readonly arrival_mode: ArrivalMode | null
    readonly arrival_date: string | null
    readonly flight_number: string | null
  }
}

const invalidLink = (): ApiError => new ApiError(404, 'invalid_link', 'This registration link is not valid. Ask the organisers for the current link.')

/** HMAC of the client IP under a key derived from the app secret (never the secret itself). */
export function hashClientIp(ip: string, secret: string): string {
  const key = createHmac('sha256', secret).update('hostmark/intake-ip-hash/v1').digest()
  return createHmac('sha256', key).update(ip).digest('hex')
}

export async function readLinkContext(db: Kysely<DB>, token: string): Promise<LinkContext> {
  const context = await withSystem(db, { actor: 'guest_intake', automatic: false }, async (tx) => {
    const { rows } = await sql<{ context: LinkContext | null }>`select public.intake_link_context(${token}) as context`.execute(tx)
    return rows[0]?.context ?? null
  })
  if (!context) throw invalidLink()
  return context
}

/** Counts this request against the IP's window; true while under the limit. */
async function consumeAllowance(tx: Tx, ipHash: string, now: Date): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowStart = new Date(Math.floor(now.getTime() / INTAKE_IP_LIMIT.windowMs) * INTAKE_IP_LIMIT.windowMs)
  // Expired windows of every address go, so many one-off addresses cannot grow the table.
  await tx.deleteFrom('intake_rate_limits').where('window_start', '<', windowStart).execute()
  const row = await tx
    .insertInto('intake_rate_limits')
    .values({ ip_hash: ipHash, window_start: windowStart, count: 1 })
    .onConflict((conflict) =>
      conflict.columns(['ip_hash', 'window_start']).doUpdateSet((eb) => ({ count: eb('intake_rate_limits.count', '+', 1) })),
    )
    .returning('count')
    .executeTakeFirstOrThrow()
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + INTAKE_IP_LIMIT.windowMs - now.getTime()) / 1000)
  return { allowed: row.count <= INTAKE_IP_LIMIT.max, retryAfterSeconds }
}

async function admit(deps: PublicIntakeDeps, token: string, ipHash: string): Promise<IntakeEvent> {
  const now = deps.now?.() ?? new Date()
  const { event, allowance } = await withSystem(deps.db, { actor: 'guest_intake', automatic: false }, async (tx) => {
    const found = await loadEvent(tx, token)
    const open = found?.intake_open && found.status !== 'archived'
    return { event: found, allowance: open ? await consumeAllowance(tx, ipHash, now) : null }
  })
  if (!event) throw invalidLink()
  if (!event.intake_open || event.status === 'archived' || !allowance) {
    throw new ApiError(409, 'intake_closed', 'Registration for this event is closed.')
  }
  if (!allowance.allowed) throw Errors.rateLimited(allowance.retryAfterSeconds)
  return event
}

type Outcome = 'linked_duplicate' | 'auto_processed' | 'needs_review'

const AUTO_PROCESS_FAILED = {
  code: 'auto_process_failed',
  severity: 'warning',
  message: 'Automatic processing failed; check the details and approve by hand',
} as const

/** Creates the records inside a savepoint: a failure leaves the submission queued for review. */
async function tryAutoProcess(tx: Tx, run: () => Promise<string>): Promise<string | null> {
  await sql`savepoint auto_process`.execute(tx)
  try {
    const delegationId = await run()
    await sql`release savepoint auto_process`.execute(tx)
    return delegationId
  } catch (error: unknown) {
    await sql`rollback to savepoint auto_process`.execute(tx)
    // No row data in the log: a constraint error can echo the guest's details.
    const { code, constraint } = (error ?? {}) as { code?: unknown; constraint?: unknown }
    logger.error('Automatic intake processing failed; queued for review', { code, constraint })
    return null
  }
}

async function store(tx: Tx, event: IntakeEvent, registration: PublicRegistration, extraction: Extraction, ipHash: string) {
  const { form } = registration
  const assessment = await assessIntake(tx, form, extraction, event)
  const submission = await insertSubmission(tx, {
    source: 'form',
    payload: jsonb(form),
    normalized: jsonb(form),
    ...extractionColumns(extraction),
    issues: jsonb(assessment.issues),
    duplicate_kind: assessment.duplicate.kind,
    matched_delegation_id: assessment.duplicate.delegation_id,
    is_high_confidence: assessment.high_confidence,
    status: 'processing',
    client_ip_hash: ipHash,
  })
  const guest = displayName(assessment.intake)

  let outcome: Outcome = 'needs_review'
  let delegationId: string | null = null
  let autoFailed = false
  if (assessment.duplicate.kind === 'exact') {
    outcome = 'linked_duplicate'
    delegationId = assessment.duplicate.delegation_id
  } else if (assessment.high_confidence && event.auto_process_enabled) {
    delegationId = await tryAutoProcess(tx, async () =>
      (await createDelegationRecords(tx, assessment.intake, extraction, { event, submission_id: submission.id })).delegation_id,
    )
    outcome = delegationId ? 'auto_processed' : 'needs_review'
    autoFailed = delegationId === null
  }
  await tx
    .updateTable('intake_submissions')
    .set({
      status: outcome,
      delegation_id: delegationId,
      ...(autoFailed ? { issues: jsonb([...assessment.issues, AUTO_PROCESS_FAILED]) } : {}),
    })
    .where('id', '=', submission.id)
    .execute()

  if (outcome === 'needs_review') {
    await notifyCoordinators(tx, { kind: 'intake_needs_review', title: `Registration to review: ${guest}`, body: `Reference ${submission.reference_code}`, entity_type: 'intake_submissions', entity_id: submission.id })
  } else if (delegationId) {
    const title = outcome === 'auto_processed' ? `New guest registered: ${guest}` : `Duplicate registration linked: ${guest}`
    await notifyCoordinators(tx, { kind: `intake_${outcome}`, title, body: `Reference ${submission.reference_code}`, entity_type: 'delegations', entity_id: delegationId })
  }
  // "We may contact you" reflects problems in what was sent, never whether someone similar is
  // already registered (that would let a link holder probe who is coming).
  const followUp = autoFailed || assessment.issues.some((issue) => issue.severity !== 'info')
  return { reference_code: submission.reference_code, follow_up: followUp, intake: assessment.intake }
}

export async function submitRegistration(
  deps: PublicIntakeDeps,
  token: string,
  registration: PublicRegistration,
  ip: string,
): Promise<RegistrationReceipt> {
  const ipHash = hashClientIp(ip, deps.ipHashSecret)
  const event = await admit(deps, token, ipHash)
  // Everything from here on belongs to the link's event (P9), whichever events exist.
  return inSystemEvent(event.id, () => registerInEvent(deps, event, registration, ip, ipHash))
}

async function registerInEvent(
  deps: PublicIntakeDeps,
  event: IntakeEvent,
  registration: PublicRegistration,
  ip: string,
  ipHash: string,
): Promise<RegistrationReceipt> {

  const bot = await deps.botCheck.verify(registration.turnstile_token, ip)
  if (!bot.ok) throw new ApiError(403, 'bot_check_failed', 'We could not confirm this registration came from a person. Reload the page and try again.')

  const preview = normalizeIntake(registration.form, event.timezone)
  const extraction = registration.form.others
    ? await deps.reader.readOthers(registration.form.others, { flight_number: preview.flight_number, party_size: preview.party.length })
    : EMPTY_EXTRACTION

  // Automatic processing is undone per submission (review.ts undoAutoProcessing), never row by row.
  const stored = await withSystem(deps.db, { actor: 'guest_intake', automatic: true, undoable: false }, (tx) =>
    store(tx, event, registration, extraction, ipHash),
  )
  if (deps.mailer) {
    await sendRegistrationConfirmation(deps.db, deps.mailer, {
      to: stored.intake.contact_email,
      guest: displayName(stored.intake),
      eventName: event.name,
      venueName: event.venue_name,
      referenceCode: stored.reference_code,
      followUp: stored.follow_up,
      arrivalDate: stored.intake.arrival_date,
      flightNumber: stored.intake.flight_number,
    })
  }
  return {
    reference_code: stored.reference_code,
    follow_up: stored.follow_up,
    summary: {
      guest: displayName(stored.intake),
      companions: stored.intake.party.length,
      arrival_mode: stored.intake.arrival_mode,
      arrival_date: stored.intake.arrival_date,
      flight_number: stored.intake.flight_number,
    },
  }
}
