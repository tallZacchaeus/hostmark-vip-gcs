import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ApiError, toApiError } from './errors'

function pgError(fields: Record<string, string>): Error {
  return Object.assign(new Error(fields.message ?? 'pg error'), fields)
}

describe('toApiError', () => {
  it('returns ApiError instances unchanged', () => {
    const error = new ApiError(404, 'not_found', 'Room not found')
    expect(toApiError(error)).toBe(error)
  })

  it('turns validation failures into a 400 with field paths', () => {
    const result = z.object({ floor: z.number().int() }).safeParse({ floor: 'two' })
    const error = toApiError(result.error)
    expect(error.status).toBe(400)
    expect(error.code).toBe('validation_failed')
    expect(error.details).toEqual([{ path: 'floor', message: expect.any(String) }])
  })

  it('uses the database hint as the code and keeps our own message', () => {
    const error = toApiError(
      pgError({
        code: '55000',
        hint: 'undo_conflict',
        message: 'Changed since by Bola at 10:02; edit it manually instead',
        detail: '{"changed_by":"Bola"}',
      }),
    )
    expect(error).toMatchObject({ status: 409, code: 'undo_conflict', details: { changed_by: 'Bola' } })
    expect(error.message).toContain('Changed since by Bola')
  })

  it.each([
    ['42501', 403, 'forbidden'],
    ['P0002', 404, 'not_found'],
    ['0A000', 501, 'not_implemented'],
    ['23P01', 409, 'overlap'],
    ['40001', 503, 'retry'],
  ])('maps SQLSTATE %s to HTTP %i', (code, status, apiCode) => {
    expect(toApiError(pgError({ code, message: 'internal detail' }))).toMatchObject({ status, code: apiCode })
  })

  it('gives unique violations a friendly message for known constraints', () => {
    const error = toApiError(pgError({ code: '23505', constraint: 'rooms_number_unique', message: 'duplicate key' }))
    expect(error).toMatchObject({ status: 409, code: 'already_exists', message: 'A room with this number already exists' })
  })

  it('separates "still in use" from "points at nothing" for foreign keys', () => {
    const inUse = toApiError(
      pgError({ code: '23503', message: 'fk', detail: 'Key (id)=(x) is still referenced from table "rooms".' }),
    )
    expect(inUse).toMatchObject({ status: 409, code: 'in_use' })

    const missing = toApiError(
      pgError({ code: '23503', message: 'fk', detail: 'Key (room_type_id)=(x) is not present in table "room_types".' }),
    )
    expect(missing).toMatchObject({ status: 400, code: 'invalid_reference' })
  })

  it('asks for the event to be set up when event_id cannot be defaulted', () => {
    const error = toApiError(pgError({ code: '23502', column: 'event_id', message: 'null value' }))
    expect(error).toMatchObject({ status: 409, code: 'event_not_found' })
  })

  it('never leaks raw database messages for unexpected errors', () => {
    const fromDb = toApiError(pgError({ code: 'XX000', message: 'relation "secret_table" is broken' }))
    expect(fromDb).toMatchObject({ status: 500, code: 'internal_error' })
    expect(fromDb.message).not.toContain('secret_table')

    const unknown = toApiError(new TypeError('cannot read properties of undefined'))
    expect(unknown).toMatchObject({ status: 500, code: 'internal_error' })
  })

  it('hides raw messages for check violations without our hint', () => {
    const error = toApiError(
      pgError({ code: '23514', constraint: 'rooms_capacity_check', message: 'new row violates check constraint' }),
    )
    expect(error).toMatchObject({ status: 400, code: 'invalid', details: { constraint: 'rooms_capacity_check' } })
    expect(error.message).not.toContain('new row')
  })
})
