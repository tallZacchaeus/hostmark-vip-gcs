// Parses the hotel's room list for CSV import (FR-PL-04). Returns every valid row plus a list
// of per-line problems, so the admin can fix the file in one pass.
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { blankToUndefined, optionalText } from '@/lib/validation/common'
import { ROOM_LIMITS, roomNumberSchema, roomTypeNameSchema, wingSchema } from '@/lib/validation/venue'

export const MAX_IMPORT_ROWS = 2000

const REQUIRED_COLUMNS = ['number', 'floor', 'wing', 'room_type'] as const
const TRUE_VALUES = ['yes', 'y', 'true', '1']
const BOOLEAN_VALUES = [...TRUE_VALUES, 'no', 'n', 'false', '0'] as const

export interface RoomCsvRow {
  readonly number: string
  readonly floor: number
  readonly wing: string
  readonly position: number
  readonly roomTypeName: string
  readonly capacity: number | null
  readonly isAccessible: boolean
  readonly outOfService: boolean
  readonly notes: string | null
}

export interface CsvRowError {
  /** 1-based line in the file; 0 for problems with the file as a whole. */
  readonly line: number
  readonly message: string
}

export interface RoomCsvParseResult {
  readonly rows: readonly RoomCsvRow[]
  readonly errors: readonly CsvRowError[]
}

interface CsvRecord {
  readonly record: string[]
  readonly info: { readonly lines: number }
}

const integerCell = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int('Must be a whole number').min(min).max(max))

const optionalIntegerCell = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int('Must be a whole number').min(min).max(max).optional())

const booleanCell = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(BOOLEAN_VALUES, { error: 'Use yes or no' }))
    .transform((value) => TRUE_VALUES.includes(value))
    .optional(),
)

const roomCsvRowSchema = z.object({
  number: roomNumberSchema,
  floor: integerCell(ROOM_LIMITS.floor.min, ROOM_LIMITS.floor.max),
  wing: wingSchema,
  position: optionalIntegerCell(ROOM_LIMITS.position.min, ROOM_LIMITS.position.max),
  room_type: roomTypeNameSchema,
  capacity: optionalIntegerCell(ROOM_LIMITS.capacity.min, ROOM_LIMITS.capacity.max),
  accessible: booleanCell,
  out_of_service: booleanCell,
  notes: optionalText(2000),
})

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`).join('; ')
}

function toRow(cells: Record<string, string | undefined>): { row?: RoomCsvRow; error?: string } {
  const parsed = roomCsvRowSchema.safeParse(cells)
  if (!parsed.success) {
    return { error: describeIssues(parsed.error) }
  }
  const value = parsed.data
  return {
    row: {
      number: value.number,
      floor: value.floor,
      wing: value.wing,
      position: value.position ?? 0,
      roomTypeName: value.room_type,
      capacity: value.capacity ?? null,
      isAccessible: value.accessible ?? false,
      outOfService: value.out_of_service ?? false,
      notes: value.notes ?? null,
    },
  }
}

function readRecords(text: string): CsvRecord[] {
  // With `info: true`, csv-parse returns { record, info } objects; its types do not model that.
  return parse(text, {
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    info: true,
  }) as unknown as CsvRecord[]
}

export function parseRoomsCsv(text: string): RoomCsvParseResult {
  let records: CsvRecord[]
  try {
    records = readRecords(text)
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'unknown problem'
    return { rows: [], errors: [{ line: 0, message: `The file could not be read: ${reason}` }] }
  }

  const [headerRecord, ...dataRecords] = records
  const headers = (headerRecord?.record ?? []).map(normaliseHeader)
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column))
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `Missing required columns: ${missing.join(', ')}` }] }
  }
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `A file can hold at most ${MAX_IMPORT_ROWS} rooms` }] }
  }

  const seenNumbers = new Set<string>()
  const rows: RoomCsvRow[] = []
  const errors: CsvRowError[] = []

  for (const { record, info } of dataRecords) {
    const cells = Object.fromEntries(headers.map((header, index) => [header, record[index]]))
    const { row, error } = toRow(cells)
    if (!row) {
      errors.push({ line: info.lines, message: error ?? 'Invalid row' })
      continue
    }
    const key = row.number.toLowerCase()
    if (seenNumbers.has(key)) {
      errors.push({ line: info.lines, message: `Room ${row.number} appears more than once in the file` })
      continue
    }
    seenNumbers.add(key)
    rows.push(row)
  }

  return { rows, errors }
}
