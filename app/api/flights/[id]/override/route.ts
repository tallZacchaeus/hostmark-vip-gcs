// Manual landing time (FR-FT-11): the coordinator's time wins over flight data until cleared
// (null). The cascade runs at once; the activity log shows the change as the coordinator's.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { systemClock } from '@/lib/domain/clock'
import { overrideArrival } from '@/lib/services/flights/ingest'
import { idParamsSchema } from '@/lib/validation/common'
import { flightOverrideSchema } from '@/lib/validation/transport'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema, body: flightOverrideSchema }, async ({ params, body, actor }) => {
  const result = await withSystem(getSystemDb(), { actor: 'system', action: 'flights.override', onBehalfOf: actor.id, undoable: false }, (tx) =>
    overrideArrival(tx, params.id, body.manual_arrival_at, systemClock.now()),
  )
  return jsonOk({ changed: result.changed, proposal_ids: result.proposal_ids })
})
