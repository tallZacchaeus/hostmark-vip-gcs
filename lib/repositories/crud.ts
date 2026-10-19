// Generic data access for the simple reference tables (room types, rooms, drivers, shifts, VIP
// categories). Every call runs inside the caller's transaction, so row-level security decides
// what is visible and writable; this layer adds no permission logic of its own.
import type { Selectable, Transaction } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { DB } from '@/lib/db/types'
import type { Pagination } from '@/lib/validation/common'

export type ReferenceTable = 'room_types' | 'rooms' | 'drivers' | 'driver_shifts' | 'vip_categories'

export interface OrderBy {
  readonly column: string
  readonly direction: 'asc' | 'desc'
}

export interface Filter {
  readonly column: string
  readonly operator: '=' | '>' | '>=' | '<'
  readonly value: unknown
}

export interface ListOptions {
  readonly pagination: Pagination
  readonly filters?: readonly Filter[]
}

export interface ListResult<Row> {
  readonly rows: Row[]
  readonly total: number
}

export interface CrudRepository<Row> {
  list(tx: Tx, options: ListOptions): Promise<ListResult<Row>>
  get(tx: Tx, id: string): Promise<Row | undefined>
  create(tx: Tx, values: object): Promise<Row>
  update(tx: Tx, id: string, values: object): Promise<Row | undefined>
  remove(tx: Tx, id: string): Promise<boolean>
}

// Kysely cannot type queries over a union of table names, so this one module works against a
// loosely typed view of the schema. Column names come only from code (never from requests) and
// values are always bound parameters; results are typed again at the return boundary.
type LooseDb = Record<string, Record<string, unknown>>
const loose = (tx: Tx): Transaction<LooseDb> => tx as unknown as Transaction<LooseDb>

export function createCrudRepository<T extends ReferenceTable>(
  table: T,
  order: readonly OrderBy[],
): CrudRepository<Selectable<DB[T]>> {
  type Row = Selectable<DB[T]>
  // Widened on purpose: against LooseDb any string is a table, which keeps Kysely's generics simple.
  const name: string = table

  return {
    async list(tx, { pagination, filters = [] }) {
      const filtered = filters.reduce(
        (query, filter) => query.where(filter.column, filter.operator, filter.value),
        loose(tx).selectFrom(name),
      )
      const counted = await filtered.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow()
      const ordered = order.reduce(
        (query, { column, direction }) => query.orderBy(column, direction),
        filtered.selectAll(),
      )
      const rows = await ordered
        .limit(pagination.limit)
        .offset((pagination.page - 1) * pagination.limit)
        .execute()
      return { rows: rows as Row[], total: Number(counted.total) }
    },

    async get(tx, id) {
      const row = await loose(tx).selectFrom(name).selectAll().where('id', '=', id).executeTakeFirst()
      return row as Row | undefined
    },

    async create(tx, values) {
      const row = await loose(tx).insertInto(name).values(values).returningAll().executeTakeFirstOrThrow()
      return row as Row
    },

    async update(tx, id, values) {
      const row = await loose(tx).updateTable(name).set(values).where('id', '=', id).returningAll().executeTakeFirst()
      return row as Row | undefined
    },

    async remove(tx, id) {
      const result = await loose(tx).deleteFrom(name).where('id', '=', id).executeTakeFirst()
      return result.numDeletedRows > 0n
    },
  }
}
