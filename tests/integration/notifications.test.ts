import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { notifyCoordinatorsOnce } from '@/lib/services/notify'
import { TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

describe('repeated alerts', () => {
  let app: TestApp
  const pickupId = '00000000-0000-4000-8000-0000000000a1'
  const alert = { kind: 'transport_alert', title: 'No driver is free for Bishop Okafor', priority: 'high' as const, entity_type: 'pickups', entity_id: pickupId }
  const send = () => withSystem(getSystemDb(), { actor: 'system' }, (tx) => notifyCoordinatorsOnce(tx, alert))
  const count = async () => (await app.sql<{ n: number }>(`select count(*)::int as n from notifications where kind = 'transport_alert' and entity_id = $1`, [pickupId]))[0]?.n

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    await app.createStaff('coordinator')
    await app.createStaff('admin')
  })
  afterAll(async () => {
    await app.stop()
  })

  it('tells each coordinator once while the same alert is still unread', async () => {
    await send()
    const first = await count()
    expect(first).toBeGreaterThanOrEqual(2)
    await send()
    await send()
    expect(await count()).toBe(first)
  })

  it('alerts again once the earlier one has been read', async () => {
    const before = await count()
    await app.sql(`update notifications set read_at = now() where entity_id = $1`, [pickupId])
    await send()
    expect(await count()).toBe((before ?? 0) * 2)
  })
})
