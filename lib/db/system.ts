// Trusted server work that no signed-in user performs: public registrations (P2) and, from P3,
// the worker. It runs on the vip_service login (the only credential that can become vip_system)
// with the audit actor set explicitly, so every row it writes is attributed in the activity log.
import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { type Dialect, Kysely, sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import { getAuthDialect } from './client'
import type { Tx } from './context'
import type { DB } from './types'

export type SystemActor = 'system' | 'guest_intake' | 'copilot'

export interface SystemAudit {
  readonly actor: SystemActor
  /** Recorded as the audit action, e.g. "intake.auto_process". */
  readonly action?: string
  readonly reason?: string
  /** Automatic changes are marked "Auto" in the activity log. */
  readonly automatic?: boolean
  /** Row-by-row Undo in the activity log (defaults to `automatic`). */
  readonly undoable?: boolean
  /**
   * The signed-in staff member who asked for this (e.g. a flight override): the activity log
   * shows it as their change. Only ever the authenticated user's own id.
   */
  readonly onBehalfOf?: string
  /** The event to work in; defaults to the one set by inSystemEvent() (P9). */
  readonly eventId?: string
}

// The event that system work in this async context belongs to (P9): one live event per worker
// pass, the link's event for a public registration, the requester's event during an API call.
const systemEvent = new AsyncLocalStorage<string>()

/** Runs `fn` so that every withSystem transaction inside it works in `eventId`. */
export function inSystemEvent<T>(eventId: string, fn: () => Promise<T>): Promise<T> {
  if (!UUID.test(eventId)) {
    throw new Error('inSystemEvent: eventId must be an event id')
  }
  return systemEvent.run(eventId, fn)
}

// One Kysely per dialect; it shares the dialect's pool, which Database.close() ends.
const clients = new WeakMap<Dialect, Kysely<DB>>()

export function getSystemDb(): Kysely<DB> {
  const dialect = getAuthDialect()
  const existing = clients.get(dialect)
  if (existing) return existing
  const created = new Kysely<DB>({ dialect })
  clients.set(dialect, created)
  return created
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Runs `fn` in a transaction as vip_system with the given audit context. */
export async function withSystem<T>(db: Kysely<DB>, audit: SystemAudit, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (audit.onBehalfOf !== undefined && !UUID.test(audit.onBehalfOf)) {
    throw new Error('withSystem: onBehalfOf must be the signed-in user id')
  }
  const eventId = audit.eventId ?? systemEvent.getStore() ?? ''
  if (eventId !== '' && !UUID.test(eventId)) {
    throw new Error('withSystem: eventId must be an event id')
  }
  // Work done for a person happens in their event; without one it must not run unscoped (it would
  // reach every event's rows).
  if (audit.onBehalfOf !== undefined && eventId === '') {
    throw new ApiError(409, 'event_not_found', 'Set up or choose an event first')
  }
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('role', 'vip_system', true), set_config('app.user_id', ${audit.onBehalfOf ?? ''}, true),
      set_config('app.event_id', ${eventId}, true)`.execute(tx)
    await sql`select private.set_audit_context(
      p_actor_type => ${audit.onBehalfOf ? 'user' : audit.actor}::public.actor_type,
      p_action => ${audit.action ?? null},
      p_reason => ${audit.reason ?? null},
      p_is_automatic => ${audit.automatic ?? !audit.onBehalfOf},
      p_undoable => ${audit.undoable ?? null}
    )`.execute(tx)
    return fn(tx)
  })
}
