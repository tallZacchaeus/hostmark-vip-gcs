import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getSystemDb } from '@/lib/db/system'
import { logger } from '@/lib/logger'
import { runWorkerTick } from '@/lib/services/worker/tick'
import { TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

// A new production install has no event until a Super Admin creates one in Settings. The worker
// runs every minute meanwhile, and must not fill the logs with errors about it.
describe('background worker before the event is set up', () => {
  let app: TestApp

  beforeAll(async () => {
    app = await TestApp.start()
  })
  afterAll(async () => {
    await app.stop()
  })

  it('runs a full pass quietly and checks no flights', async () => {
    // Arrange
    const errors = vi.spyOn(logger, 'error')

    // Act
    const report = await runWorkerTick(getSystemDb(), { holder: 'server-a', now: new Date('2026-12-10T08:00:00Z'), poll: true, dailyLimit: 10 })

    // Assert
    expect(report).toEqual({ simulation_steps: 0, poll: null, suggestions: 0, room_suggestions: 0 })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
