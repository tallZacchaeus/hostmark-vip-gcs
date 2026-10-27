// Server-Sent Events: pushes `event: notification` with { id, kind, priority } as soon as a
// notification is created for the signed-in user. Clients then fetch details from
// GET /api/notifications. Browsers' EventSource cannot send an Authorization header, so
// same-origin clients use the session cookie and others use a fetch-based SSE client.
// Streams close after MAX_STREAM_MS; the client reconnects (`retry:`), which re-checks the
// session, so a deactivated account stops receiving events within that window.
import { ApiError } from '@/lib/api/errors'
import { defineRoute } from '@/lib/api/route'
import { ANY_ROLE } from '@/lib/auth/roles'
import { getNotificationHub } from '@/lib/realtime/hub'

export const dynamic = 'force-dynamic'
// Vercel ends a function at maxDuration (300 s on every plan); elsewhere this has no effect.
export const maxDuration = 300

const HEARTBEAT_MS = 25_000
const RECONNECT_DELAY_MS = 5_000
// On Vercel, close shortly before maxDuration so clients reconnect cleanly instead of seeing an error.
const MAX_STREAM_MS = process.env.VERCEL ? 280_000 : 15 * 60_000

export const GET = defineRoute({ roles: ANY_ROLE }, async ({ actor, request }) => {
  const encoder = new TextEncoder()
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined
  let closed = false

  const send = (text: string): void => {
    if (closed || !controllerRef) return
    try {
      controllerRef.enqueue(encoder.encode(text))
    } catch {
      cleanup()
    }
  }

  // Created before subscribing so no event is dropped in between.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
    },
    cancel() {
      cleanup()
    },
  })

  const unsubscribe = await getNotificationHub().subscribe(actor.id, (event) => {
    send(`event: notification\ndata: ${JSON.stringify({ id: event.id, kind: event.kind, priority: event.priority })}\n\n`)
  })
  if (!unsubscribe) {
    throw new ApiError(429, 'too_many_streams', 'Too many open notification streams for this account')
  }

  const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)
  const lifetime = setTimeout(() => cleanup(), MAX_STREAM_MS)
  function cleanup(): void {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    clearTimeout(lifetime)
    unsubscribe?.()
    try {
      controllerRef?.close()
    } catch {
      // Already closed by the client.
    }
  }

  request.signal.addEventListener('abort', cleanup, { once: true })
  if (request.signal.aborted) {
    // The client left while we were subscribing: release the slot now.
    cleanup()
  }

  send(`retry: ${RECONNECT_DELAY_MS}\n: connected\n\n`)
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // Stops proxies from buffering the stream.
      'X-Accel-Buffering': 'no',
    },
  })
})
