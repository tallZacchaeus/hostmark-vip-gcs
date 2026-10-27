import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as undo } from '@/app/api/audit/[id]/undo/route'
import { GET as listAudit } from '@/app/api/audit/route'
import { GET as listDecisions } from '@/app/api/decisions/route'
import { POST as markRead } from '@/app/api/notifications/read/route'
import { GET as listNotifications } from '@/app/api/notifications/route'
import { GET as stream } from '@/app/api/notifications/stream/route'
import { POST as approve } from '@/app/api/proposals/[id]/approve/route'
import { POST as reject } from '@/app/api/proposals/[id]/reject/route'
import { type StaffMember, TestApp } from './support/test-app'

const STREAM_TIMEOUT_MS = 5_000

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> {
  const decoder = new TextDecoder()
  const deadline = Date.now() + STREAM_TIMEOUT_MS
  let received = ''
  while (!received.includes(marker)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for "${marker}"; received: ${received}`)
    }
    const { value, done } = await reader.read()
    if (done) break
    received += decoder.decode(value)
  }
  return received
}

describe('notifications, decisions and undo API', () => {
  let app: TestApp
  let coordinator: StaffMember
  let driver: StaffMember
  let otherDriver: StaffMember

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    driver = await app.createStaff('driver')
    otherDriver = await app.createStaff('driver')
  })
  afterAll(async () => {
    await app.stop()
  })

  async function notify(recipient: StaffMember, title: string): Promise<void> {
    await app.sql(`select private.notify_users(array[$1::uuid], 'pickup_changed', $2)`, [recipient.id, title])
  }

  async function createProposal(title: string, kind = 'driver_assignment'): Promise<string> {
    const [row] = await app.sql<{ id: string }>(
      `select private.create_proposal(
         p_kind => $2::public.proposal_kind, p_title => $1, p_payload => '{}'::jsonb,
         p_created_by_type => 'system', p_target_type => 'pickups', p_target_id => gen_random_uuid()) as id`,
      [title, kind],
    )
    return row?.id ?? ''
  }

  describe('notifications', () => {
    it("lists only the user's own notifications with an unread count, and marks them read", async () => {
      await notify(driver, 'Pickup moved to 16:45')
      await notify(otherDriver, 'Not for you')

      const list = await app.call<{ items: Array<{ title: string }>; unread_count: number }>(listNotifications, '/api/notifications', {
        as: driver,
      })
      expect(list.body.data.items.map((item) => item.title)).toEqual(['Pickup moved to 16:45'])
      expect(list.body.data.unread_count).toBe(1)

      const marked = await app.call<{ updated: number }>(markRead, '/api/notifications/read', { as: driver, body: {} })
      expect(marked.body.data.updated).toBe(1)

      const unread = await app.call<{ items: unknown[] }>(listNotifications, '/api/notifications?unread_only=true', { as: driver })
      expect(unread.body.data.items).toEqual([])
    })

    it('pushes new notifications to an open stream in real time', async () => {
      const controller = new AbortController()
      const response = await app.rawCall(stream, '/api/notifications/stream', { as: driver, signal: controller.signal })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/event-stream')

      const reader = (response.body as ReadableStream<Uint8Array>).getReader()
      await readUntil(reader, ': connected')
      await notify(otherDriver, 'Someone else')
      await notify(driver, 'Room 412 ready')
      const received = await readUntil(reader, 'event: notification')

      const data = JSON.parse(received.split('event: notification\ndata: ')[1]?.split('\n')[0] ?? '{}')
      expect(data).toMatchObject({ kind: 'pickup_changed', priority: 'normal' })
      const [own] = await app.sql<{ id: string }>(`select id from notifications where title = 'Room 412 ready'`)
      expect(data.id).toBe(own?.id)

      controller.abort()
      await reader.cancel()
    })
  })

  describe('decisions queue', () => {
    it('lists pending proposals for coordinators only', async () => {
      await createProposal('Assign driver to EK783')
      const coordinatorView = await app.call<Array<{ title: string }>>(listDecisions, '/api/decisions', { as: coordinator })
      expect(coordinatorView.body.data.map((item) => item.title)).toContain('Assign driver to EK783')
      expect((await app.call(listDecisions, '/api/decisions', { as: driver })).status).toBe(403)
    })

    it('rejects a proposal, and fails a Co-Pilot action it cannot carry out', async () => {
      const toReject = await createProposal('Assign driver to QR1405')
      const rejected = await app.call<{ status: string }>(reject, `/api/proposals/${toReject}/reject`, {
        as: coordinator,
        params: { id: toReject },
        body: { note: 'Driver off sick' },
      })
      expect(rejected.body.data.status).toBe('rejected')

      const again = await app.call(reject, `/api/proposals/${toReject}/reject`, { as: coordinator, params: { id: toReject }, body: {} })
      expect(again.status).toBe(409)
      expect(again.body.error?.code).toBe('not_pending')

      const toApprove = await createProposal('Add a note for the Okafor party', 'copilot_action')
      const approved = await app.call<{ status: string; error: string }>(approve, `/api/proposals/${toApprove}/approve`, { as: coordinator, params: { id: toApprove }, body: {} })
      expect(approved.status).toBe(200)
      expect(approved.body.data).toMatchObject({ status: 'failed', error: 'invalid_payload' })
    })
  })

  describe('undo', () => {
    it('undoes an automatic change once, and only for coordinators', async () => {
      const [roomType] = await app.sql<{ id: string }>(
        `insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Suite', 1, 2, 45) returning id`,
      )
      const [room] = await app.sql<{ id: string }>(
        `insert into rooms (number, floor, wing, room_type_id) values ('501', 5, 'East', $1) returning id`,
        [roomType?.id],
      )
      // A change with no signed-in user is recorded as an automatic system action.
      await app.sql(`update rooms set housekeeping_status = 'needs_cleaning' where id = $1`, [room?.id])

      const log = await app.call<Array<{ id: string; is_automatic: boolean; undoable: boolean }>>(
        listAudit,
        `/api/audit?entity_id=${room?.id}&automatic=true`,
        { as: coordinator },
      )
      const entry = log.body.data[0]
      expect(entry).toMatchObject({ is_automatic: true, undoable: true })
      const entryId = entry?.id ?? ''

      const forbidden = await app.call(undo, `/api/audit/${entryId}/undo`, { as: driver, params: { id: entryId }, body: {} })
      expect(forbidden.status).toBe(403)

      const undone = await app.call(undo, `/api/audit/${entryId}/undo`, {
        as: coordinator,
        params: { id: entryId },
        body: { reason: 'Guest has not checked out' },
      })
      expect(undone.status).toBe(200)
      const [status] = await app.sql<{ housekeeping_status: string }>(`select housekeeping_status from rooms where id = $1`, [room?.id])
      expect(status?.housekeeping_status).toBe('clean')

      const twice = await app.call(undo, `/api/audit/${entryId}/undo`, { as: coordinator, params: { id: entryId }, body: {} })
      expect(twice.status).toBe(409)
      expect(twice.body.error?.code).toBe('already_undone')
    })

    it('rejects malformed audit ids', async () => {
      const result = await app.call(undo, '/api/audit/abc/undo', { as: coordinator, params: { id: 'abc' }, body: {} })
      expect(result.status).toBe(400)
    })
  })
})
