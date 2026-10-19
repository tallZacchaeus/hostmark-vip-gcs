'use client'
// Live updates (FR-PL-08): the server pushes `notification` events with ids only; the client
// then refreshes the affected lists through the RLS-protected API. EventSource reconnects by
// itself (the server sends `retry:` and closes streams every 15 minutes).
import { useEffect, useRef } from 'react'

export interface NotificationEvent {
  readonly id: string
  readonly kind: string
  readonly priority: 'normal' | 'high'
}

const STREAM_PATH = '/api/notifications/stream'

export function parseNotificationEvent(data: string): NotificationEvent | null {
  try {
    const value = JSON.parse(data) as Partial<NotificationEvent>
    if (typeof value.id === 'string' && typeof value.kind === 'string') {
      return { id: value.id, kind: value.kind, priority: value.priority === 'high' ? 'high' : 'normal' }
    }
  } catch {
    // Ignore malformed events; the next refresh shows the truth anyway.
  }
  return null
}

export function useNotificationStream(onEvent: (event: NotificationEvent) => void): void {
  const handler = useRef(onEvent)
  useEffect(() => {
    handler.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined
    const source = new EventSource(STREAM_PATH)
    const listener = (message: MessageEvent<string>) => {
      const event = parseNotificationEvent(message.data)
      if (event) handler.current(event)
    }
    source.addEventListener('notification', listener)
    return () => {
      source.removeEventListener('notification', listener)
      source.close()
    }
  }, [])
}
