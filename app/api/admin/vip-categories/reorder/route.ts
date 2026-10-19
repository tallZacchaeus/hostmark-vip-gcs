// Sets the whole rank order at once: { "ids": [highest, ..., lowest] }.
import { sql } from 'kysely'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { vipCategoryReorderSchema } from '@/lib/validation/vip-categories'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, body: vipCategoryReorderSchema }, async ({ body, asActor }) => {
  const categories = await asActor(async (tx) => {
    await sql`select public.reorder_vip_categories(${body.ids}::uuid[])`.execute(tx)
    return tx.selectFrom('vip_categories').selectAll().orderBy('rank').execute()
  })
  return jsonOk(categories)
})
