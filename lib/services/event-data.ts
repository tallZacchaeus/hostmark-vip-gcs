// Super Admin data export and post-event purge of guest personal data (PRD §3, TRD §7 Privacy).
// The rules (Super Admin only, after the event's end date, the confirmation phrase, one audit entry)
// live in public.export_event_data / public.purge_guest_data (20261110120000_event_data_purge.sql).
import { sql } from 'kysely'
import { z } from 'zod'
import type { Tx } from '@/lib/db/context'

export const purgeRequestSchema = z.object({
  /** The event name, typed again by the Super Admin. */
  confirmation: z.string().trim().min(1, 'Type the event name to confirm').max(200),
})

export type PurgeRequest = z.infer<typeof purgeRequestSchema>

/** Rows anonymised per table, as recorded in the "event.purge" audit entry. */
export type PurgeSummary = Readonly<Record<string, number>>

export interface EventExport {
  readonly exported_at: string
  readonly event: { readonly name: string } & Readonly<Record<string, unknown>>
  readonly [table: string]: unknown
}

export async function exportEventData(tx: Tx): Promise<EventExport> {
  const { rows } = await sql<{ data: EventExport }>`select public.export_event_data() as data`.execute(tx)
  const data = rows[0]?.data
  if (!data) throw new Error('export_event_data returned nothing')
  return data
}

/**
 * Upper bound for the purge statement. It rewrites every guest row and the audit history in one
 * transaction (a few seconds for hundreds of guests); set here because a timeout set inside the
 * function would not apply to the statement that is already running.
 */
const PURGE_STATEMENT_TIMEOUT_MS = 120_000

export async function purgeGuestData(tx: Tx, request: PurgeRequest): Promise<PurgeSummary> {
  await sql`select set_config('statement_timeout', ${String(PURGE_STATEMENT_TIMEOUT_MS)}, true)`.execute(tx)
  const { rows } = await sql<{ summary: PurgeSummary }>`select public.purge_guest_data(${request.confirmation}) as summary`.execute(tx)
  return rows[0]?.summary ?? {}
}

/** "Annual Summit 2026" exported on 10 Nov 2026 → "annual-summit-2026-export-2026-11-10.json". */
export function exportFileName(eventName: string, exportedAt: string): string {
  const slug = eventName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'event'}-export-${exportedAt.slice(0, 10)}.json`
}
