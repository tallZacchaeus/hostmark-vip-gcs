// Super Admin download of the event's operational data as a JSON file (PRD §3 "data export").
// POST, not GET: it writes an audit entry, and POST gets the API's origin (CSRF) check.
// No accounts, sessions or auth tables; each export is recorded in the audit log ("event.export").
import { createRateLimiter } from '@/lib/api/rate-limit'
import { defineRoute } from '@/lib/api/route'
import { exportEventData, exportFileName } from '@/lib/services/event-data'

const EXPORTS_PER_MINUTE = 5

export const POST = defineRoute(
  { roles: ['super_admin'], rateLimit: createRateLimiter({ windowMs: 60_000, max: EXPORTS_PER_MINUTE }) },
  async ({ asActor }) => {
    const data = await asActor((tx) => exportEventData(tx))
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName(data.event.name, data.exported_at)}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
)
