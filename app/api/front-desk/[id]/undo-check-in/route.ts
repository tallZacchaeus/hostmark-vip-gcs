// "Undo" right after a mistaken check-in (within ten minutes; by whoever did it or a coordinator).
import { sql } from 'kysely'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { FRONT_DESK_ROLES } from '@/lib/auth/roles'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: FRONT_DESK_ROLES, params: idParamsSchema }, async ({ params, asActor }) => {
  const result = await asActor(async (tx) => {
    const { rows } = await sql<{ result: { delegation_id: string; undone: number } }>`select public.undo_check_in(${params.id}::uuid) as result`.execute(tx)
    return rows[0]?.result
  })
  return jsonOk(result)
})
