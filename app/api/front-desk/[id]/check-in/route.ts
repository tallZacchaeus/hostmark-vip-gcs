// Check a party in (id = delegation). The first confirmation wins: 409 `already_checked_in` says
// who and when; 409 `room_not_ready` names the rooms housekeeping is still on.
import { sql } from 'kysely'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { FRONT_DESK_ROLES } from '@/lib/auth/roles'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: FRONT_DESK_ROLES, params: idParamsSchema }, async ({ params, asActor }) => {
  const result = await asActor(async (tx) => {
    const { rows } = await sql<{ result: { delegation_id: string; rooms: string[] } }>`select public.check_in_party(${params.id}::uuid) as result`.execute(tx)
    return rows[0]?.result
  })
  return jsonOk(result)
})
