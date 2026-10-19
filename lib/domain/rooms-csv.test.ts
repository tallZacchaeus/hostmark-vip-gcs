import { describe, expect, it } from 'vitest'
import { MAX_IMPORT_ROWS, parseRoomsCsv } from './rooms-csv'

const HEADER = 'Number,Floor,Wing,Position,Room Type,Capacity,Accessible,Out of service,Notes'

describe('parseRoomsCsv', () => {
  it('parses valid rows, normalising headers, booleans and blanks', () => {
    const csv = [
      HEADER,
      '101,1,East,3,Deluxe Suite,2,yes,no,Sea view',
      '102,1,East,,Standard,,,,',
    ].join('\n')

    const result = parseRoomsCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      {
        number: '101',
        floor: 1,
        wing: 'East',
        position: 3,
        roomTypeName: 'Deluxe Suite',
        capacity: 2,
        isAccessible: true,
        outOfService: false,
        notes: 'Sea view',
      },
      {
        number: '102',
        floor: 1,
        wing: 'East',
        position: 0,
        roomTypeName: 'Standard',
        capacity: null,
        isAccessible: false,
        outOfService: false,
        notes: null,
      },
    ])
  })

  it('reports invalid rows with their line numbers and keeps the valid ones', () => {
    const csv = [HEADER, '201,two,West,1,Standard,2,no,no,', ',2,West,1,Standard,2,maybe,no,'].join('\n')
    const result = parseRoomsCsv(csv)
    expect(result.rows).toEqual([])
    expect(result.errors.map((error) => error.line)).toEqual([2, 3])
    expect(result.errors[1]?.message).toMatch(/number|accessible/i)
  })

  it('flags room numbers that appear twice in the file', () => {
    const csv = [HEADER, '301,3,North,1,Standard,2,no,no,', '301,3,North,2,Standard,2,no,no,'].join('\n')
    const result = parseRoomsCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toEqual([{ line: 3, message: 'Room 301 appears more than once in the file' }])
  })

  it('requires the mandatory columns', () => {
    const result = parseRoomsCsv('Number,Floor\n101,1')
    expect(result.rows).toEqual([])
    expect(result.errors[0]).toMatchObject({ line: 1 })
    expect(result.errors[0]?.message).toMatch(/wing.*room_type/i)
  })

  it('refuses files that are too large', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => `${index},1,East,1,Standard,2,no,no,`)
    const result = parseRoomsCsv([HEADER, ...rows].join('\n'))
    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([{ line: 0, message: `A file can hold at most ${MAX_IMPORT_ROWS} rooms` }])
  })

  it('reports malformed CSV instead of throwing', () => {
    const result = parseRoomsCsv(`${HEADER}\n"101,1,East`)
    expect(result.rows).toEqual([])
    expect(result.errors[0]?.message).toMatch(/could not be read/i)
  })
})
