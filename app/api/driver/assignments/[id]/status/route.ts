// The driver's one status button: en_route → picked_up → completed (FR-FT-09). The database only
// lets a driver update their own active trip.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { setTripStatus } from '@/lib/repositories/driver-app'
import { idParamsSchema } from '@/lib/validation/common'
import { tripStatusSchema } from '@/lib/validation/transport'

export const POST = defineRoute({ roles: ['driver'], params: idParamsSchema, body: tripStatusSchema }, async ({ params, body, asActor }) => {
  return jsonOk(await asActor((tx) => setTripStatus(tx, params.id, body.status)))
})
