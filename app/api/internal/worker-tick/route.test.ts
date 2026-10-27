import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const state = vi.hoisted(() => ({ env: {} as Record<string, unknown> }))
const runWorkerTick = vi.hoisted(() => vi.fn())
vi.mock('@/lib/env', () => ({ getServerEnv: () => state.env }))
vi.mock('@/lib/db/system', () => ({ getSystemDb: () => 'system-db' }))
vi.mock('@/lib/services/worker/tick', () => ({ runWorkerTick }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const SECRET = 'k'.repeat(64)
const REPORT = { simulation_steps: 2, poll: null, suggestions: 0, room_suggestions: 0 }

function call(query: string, authorization?: string): Promise<Response> {
  const headers: HeadersInit = authorization ? { authorization } : {}
  return GET(new Request(`http://localhost:3000/api/internal/worker-tick${query}`, { headers }))
}

describe('GET /api/internal/worker-tick', () => {
  beforeEach(() => {
    state.env = { CRON_SECRET: SECRET, AERODATABOX_API_KEY: undefined, FLIGHT_POLL_DAILY_LIMIT: 160 }
    runWorkerTick.mockReset()
  })

  it('does not exist when no scheduler secret is configured', async () => {
    state.env = { ...state.env, CRON_SECRET: undefined }
    const response = await call('', `Bearer ${SECRET}`)
    expect(response.status).toBe(404)
    expect(runWorkerTick).not.toHaveBeenCalled()
  })

  it('rejects callers without the secret', async () => {
    expect((await call('')).status).toBe(401)
    expect((await call('', 'Bearer wrong')).status).toBe(401)
    expect(runWorkerTick).not.toHaveBeenCalled()
  })

  it('runs one pass as the shared scheduler holder; poll=1 also checks flights', async () => {
    runWorkerTick.mockResolvedValue(REPORT)
    const response = await call('?poll=1', `Bearer ${SECRET}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { ran: true, report: REPORT } })
    expect(runWorkerTick).toHaveBeenCalledWith('system-db', expect.objectContaining({ holder: 'scheduler', poll: true, dailyLimit: 160 }))

    await call('', `Bearer ${SECRET}`)
    expect(runWorkerTick).toHaveBeenLastCalledWith('system-db', expect.objectContaining({ holder: 'scheduler', poll: false }))
  })

  it('says so when another process holds the worker lease', async () => {
    runWorkerTick.mockResolvedValue(null)
    expect(await (await call('', `Bearer ${SECRET}`)).json()).toMatchObject({ data: { ran: false, report: null } })
  })

  it('fails without revealing why', async () => {
    runWorkerTick.mockRejectedValue(new Error('connection to db.internal refused'))
    const response = await call('', `Bearer ${SECRET}`)
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('db.internal')
  })
})
