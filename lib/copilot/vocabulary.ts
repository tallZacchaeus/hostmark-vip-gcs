// The live names the Co-Pilot resolves questions against, read as the signed-in user (RLS):
// expected guests, active drivers, the event's flights and its rooms.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { Vocabulary } from '@/lib/domain/copilot/intent'

export async function loadVocabulary(tx: Tx): Promise<Vocabulary> {
  const [guests, drivers, flights, rooms] = await Promise.all([
    sql<{ id: string; name: string; title: string | null }>`select id, full_name as name, title from public.guests where status <> 'cancelled' and full_name is not null`.execute(tx),
    sql<{ id: string; name: string }>`select id, full_name as name from public.drivers where is_active`.execute(tx),
    sql<{ flight_number: string }>`select distinct flight_number from public.flights`.execute(tx),
    sql<{ number: string }>`select number from public.rooms`.execute(tx),
  ])
  return {
    guests: guests.rows,
    drivers: drivers.rows,
    flights: flights.rows.map((row) => row.flight_number),
    rooms: rooms.rows.map((row) => row.number),
  }
}
