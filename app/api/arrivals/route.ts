// Arrivals board (03-App-Flow.md /arrivals): one day's arrivals with live flight status, pickup,
// driver and pending suggestion. ?day=YYYY-MM-DD, default today or the next day with arrivals.
import { ApiError } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { loadArrivalsBoard } from '@/lib/repositories/arrivals'
import { dayQuerySchema } from '@/lib/validation/transport'

export const GET = defineRoute({ roles: COORDINATOR_PLUS, query: dayQuerySchema }, async ({ query, asActor }) => {
  const board = await asActor((tx) => loadArrivalsBoard(tx, query.day, systemClock.now()))
  if (!board) throw new ApiError(409, 'event_not_found', 'Set up the event first')
  return jsonOk(board)
})
