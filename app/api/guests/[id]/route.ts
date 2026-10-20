// One guest (03-App-Flow.md /guests/[id]): GET the profile with party, arrival, pickup, issues
// and history (a delegation id resolves to its principal); PATCH coordinator changes with
// optimistic locking; DELETE removes a party member (never the principal).
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS, GUEST_READERS } from '@/lib/auth/roles'
import { getGuestProfile } from '@/lib/repositories/guests'
import { removeMember, updateGuest } from '@/lib/services/guests'
import { idParamsSchema } from '@/lib/validation/common'
import { guestUpdateSchema } from '@/lib/validation/guests'

export const GET = defineRoute({ roles: GUEST_READERS, params: idParamsSchema }, async ({ params, asActor }) =>
  jsonOk(await asActor((tx) => getGuestProfile(tx, params.id))),
)

export const PATCH = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema, body: guestUpdateSchema }, async ({ params, body, asActor }) =>
  jsonOk(await asActor((tx) => updateGuest(tx, params.id, body))),
)

export const DELETE = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ params, asActor }) =>
  jsonOk(await asActor((tx) => removeMember(tx, params.id))),
)
