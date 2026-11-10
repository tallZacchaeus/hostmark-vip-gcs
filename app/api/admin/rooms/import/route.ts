// Room list import (FR-PL-04). Send the CSV as the request body with Content-Type: text/csv.
// ?dry_run=true validates and reports what would change without writing anything. Rooms a real
// import takes out of service have their stays re-planned afterwards, as in Settings → Rooms.
// Columns: Number, Floor, Wing, Position, Room Type, Capacity, Accessible, Out of service, Notes.
import { z } from 'zod'
import { readLimitedText } from '@/lib/api/body'
import { ApiError } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { parseRoomsCsv } from '@/lib/domain/rooms-csv'
import { reworkRoomsTakenOutOfService } from '@/lib/services/rooms/out-of-service'
import { assertNoParseErrors, importRooms } from '@/lib/services/rooms-import'
import { booleanQuery } from '@/lib/validation/common'

const MAX_CSV_BYTES = 2_000_000

const importQuerySchema = z.object({ dry_run: booleanQuery.optional() })

async function readCsvBody(request: Request): Promise<string> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('text/csv')) {
    throw new ApiError(415, 'unsupported_media_type', 'Send the file as the request body with Content-Type: text/csv')
  }
  return readLimitedText(request, MAX_CSV_BYTES)
}

export const POST = defineRoute({ roles: ADMIN_PLUS, query: importQuerySchema }, async ({ query, request, actor, asActor }) => {
  const { rows, errors } = parseRoomsCsv(await readCsvBody(request))
  assertNoParseErrors(errors)
  const { summary, taken_out_of_service: takenOutOfService } = await asActor((tx) => importRooms(tx, rows, query.dry_run ?? false))
  await reworkRoomsTakenOutOfService(takenOutOfService, actor.id)
  return jsonOk(summary, { status: summary.dry_run ? 200 : 201 })
})
