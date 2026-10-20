// Transport board (03-App-Flow.md /transport): pending driver decisions, pickups without a driver
// and one timeline row per driver for a day. ?day=YYYY-MM-DD, default today or the next busy day.
import { ApiError } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { loadTransportBoard } from '@/lib/repositories/transport'
import { dayQuerySchema } from '@/lib/validation/transport'

export const GET = defineRoute({ roles: COORDINATOR_PLUS, query: dayQuerySchema }, async ({ query, asActor }) => {
  const board = await asActor((tx) => loadTransportBoard(tx, query.day, systemClock.now()))
  if (!board) throw new ApiError(409, 'event_not_found', 'Set up the event first')
  return jsonOk(board)
})
