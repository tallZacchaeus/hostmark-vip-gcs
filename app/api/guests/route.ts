// Guests (03-App-Flow.md /guests): GET one row per delegation with arrival, transport and open
// issues, plus a count per tab; POST adds a delegation by hand ("Add guest", coordinators only).
import { ApiError } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS, GUEST_READERS } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { zonedDateKey } from '@/lib/domain/time'
import { findEventContext } from '@/lib/repositories/event'
import { listDelegations } from '@/lib/repositories/guests'
import { createGuestManually } from '@/lib/services/intake/review'
import { guestListQuerySchema, manualGuestSchema } from '@/lib/validation/guests'

export const GET = defineRoute({ roles: GUEST_READERS, query: guestListQuerySchema }, async ({ query, asActor }) => {
  const { page, limit, ...filters } = query
  const result = await asActor(async (tx) => {
    // The safe event context: the front desk may not read the events row (it holds the intake token).
    const event = await findEventContext(tx)
    if (!event) throw new ApiError(409, 'event_not_found', 'Set up the event first')
    return listDelegations(tx, filters, { page, limit }, event.timezone, zonedDateKey(systemClock.now(), event.timezone))
  })
  return jsonOk({ rows: result.rows, tabs: result.tabs, totals: result.totals }, { meta: { total: result.total, page, limit } })
})

export const POST = defineRoute({ roles: COORDINATOR_PLUS, body: manualGuestSchema }, async ({ db, actor, body }) => {
  const records = await createGuestManually(db, actor, body.fields, body.vip_category_id ?? null, body.allow_duplicate)
  return jsonOk(records, { status: 201 })
})
