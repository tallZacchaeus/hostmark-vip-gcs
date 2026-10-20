// "Got it" on a new or moved trip: the coordinator can see the driver has read the change.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { acknowledgeTrip } from '@/lib/repositories/driver-app'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: ['driver'], params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => acknowledgeTrip(tx, params.id)))
})
