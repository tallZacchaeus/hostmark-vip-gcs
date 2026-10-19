// Real-time notification fan-out (FR-PL-08), replacing Supabase Realtime on the droplet.
// One Postgres LISTEN connection receives pg_notify events from the notifications trigger and
// passes them to each recipient's open Server-Sent Events streams. Events carry only ids and
// kinds; clients fetch the notification itself through the RLS-protected API.
import { z } from 'zod'
import type { Logger } from '@/lib/logger'

export const NOTIFICATION_CHANNEL = 'vip_notifications'
export const MAX_STREAMS_PER_USER = 5

const eventSchema = z.object({
  id: z.uuid(),
  recipient_id: z.uuid(),
  kind: z.string(),
  priority: z.enum(['normal', 'high']),
})

export type NotificationEvent = z.infer<typeof eventSchema>
export type NotificationListener = (event: NotificationEvent) => void

/** Subscribes to a Postgres channel; resolves to an unsubscribe function. */
export interface ChannelSource {
  listen(channel: string, onPayload: (payload: string) => void): Promise<() => Promise<void>>
}

export interface NotificationHub {
  /** Resolves to an unsubscribe function, or null when the user has too many open streams. */
  subscribe(userId: string, listener: NotificationListener): Promise<(() => void) | null>
  listenerCount(userId: string): number
  close(): Promise<void>
}

export function createNotificationHub(source: ChannelSource, logger: Logger): NotificationHub {
  const listeners = new Map<string, Set<NotificationListener>>()
  let started: Promise<() => Promise<void>> | undefined

  function deliver(payload: string): void {
    let event: NotificationEvent
    try {
      event = eventSchema.parse(JSON.parse(payload))
    } catch (error: unknown) {
      logger.warn('Ignored malformed notification event', { error })
      return
    }
    for (const listener of listeners.get(event.recipient_id) ?? []) {
      // One broken stream must not stop delivery to the recipient's other streams.
      try {
        listener(event)
      } catch (error: unknown) {
        logger.warn('A notification listener failed', { error })
      }
    }
  }

  function ensureListening(): Promise<() => Promise<void>> {
    // A failed first LISTEN is not cached: the next subscriber tries again.
    started ??= source.listen(NOTIFICATION_CHANNEL, deliver).catch((error: unknown) => {
      started = undefined
      throw error
    })
    return started
  }

  return {
    async subscribe(userId, listener) {
      await ensureListening()
      // Read, check and update in one synchronous step (no await in between), so concurrent
      // subscriptions for the same user cannot overwrite each other or exceed the cap.
      const current = listeners.get(userId) ?? new Set<NotificationListener>()
      if (current.size >= MAX_STREAMS_PER_USER) {
        return null
      }
      listeners.set(userId, new Set([...current, listener]))
      return () => {
        const remaining = [...(listeners.get(userId) ?? [])].filter((existing) => existing !== listener)
        if (remaining.length === 0) {
          listeners.delete(userId)
        } else {
          listeners.set(userId, new Set(remaining))
        }
      }
    },
    listenerCount: (userId) => listeners.get(userId)?.size ?? 0,
    async close() {
      listeners.clear()
      const stop = await started
      started = undefined
      await stop?.()
    },
  }
}
