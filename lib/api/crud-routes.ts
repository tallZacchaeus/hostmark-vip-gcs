// Builds list / get / create / update / delete handlers for a reference resource.
// Route files then become one-liners, e.g. `export const GET = roomRoutes.list`.
import 'server-only'
import type { z } from 'zod'
import type { AppRole } from '@/lib/auth/roles'
import type { CrudRepository, Filter } from '@/lib/repositories/crud'
import { type Pagination, idParamsSchema } from '@/lib/validation/common'
import { Errors } from './errors'
import type { NextRouteHandler } from './handler'
import { jsonOk } from './response'
import { defineRoute } from './route'

export interface CrudRoutesConfig<Row, Query extends Pagination> {
  /** Singular, for messages: "Room not found". */
  readonly entityName: string
  readonly repository: CrudRepository<Row>
  readonly readRoles: readonly AppRole[]
  readonly writeRoles: readonly AppRole[]
  readonly createSchema: z.ZodType<object>
  readonly updateSchema: z.ZodType<object>
  readonly listQuerySchema: z.ZodType<Query>
  readonly toFilters?: (query: Query) => Filter[]
}

export interface CrudRoutes {
  readonly list: NextRouteHandler
  readonly get: NextRouteHandler
  readonly create: NextRouteHandler
  readonly update: NextRouteHandler
  readonly remove: NextRouteHandler
}

export function createCrudRoutes<Row, Query extends Pagination>(config: CrudRoutesConfig<Row, Query>): CrudRoutes {
  const { entityName, repository, readRoles, writeRoles } = config

  return {
    list: defineRoute({ roles: readRoles, query: config.listQuerySchema }, async ({ query, asActor }) => {
      const filters = config.toFilters?.(query) ?? []
      const { rows, total } = await asActor((tx) => repository.list(tx, { pagination: query, filters }))
      return jsonOk(rows, { meta: { total, page: query.page, limit: query.limit } })
    }),

    get: defineRoute({ roles: readRoles, params: idParamsSchema }, async ({ params, asActor }) => {
      const row = await asActor((tx) => repository.get(tx, params.id))
      if (!row) {
        throw Errors.notFound(entityName)
      }
      return jsonOk(row)
    }),

    create: defineRoute({ roles: writeRoles, body: config.createSchema }, async ({ body, asActor }) => {
      const row = await asActor((tx) => repository.create(tx, body))
      return jsonOk(row, { status: 201 })
    }),

    update: defineRoute(
      { roles: writeRoles, params: idParamsSchema, body: config.updateSchema },
      async ({ params, body, asActor }) => {
        const row = await asActor((tx) => repository.update(tx, params.id, body))
        if (!row) {
          throw Errors.notFound(entityName)
        }
        return jsonOk(row)
      },
    ),

    remove: defineRoute({ roles: writeRoles, params: idParamsSchema }, async ({ params, asActor }) => {
      const deleted = await asActor((tx) => repository.remove(tx, params.id))
      if (!deleted) {
        throw Errors.notFound(entityName)
      }
      return jsonOk({ id: params.id, deleted: true })
    }),
  }
}
