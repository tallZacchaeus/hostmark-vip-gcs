// The coordination desk phone: set by Admin in event settings, read by drivers with their trips.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as getEvent, PATCH as patchEvent } from '@/app/api/admin/event/route'
import { POST as createEvent } from '@/app/api/events/route'
import { GET as driverPickups } from '@/app/api/driver/pickups/route'
import { EVENT_LAST_DAY } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'
import { EVENT_DAY, addDriver } from './support/transport-fixture'

const EVENT = {
  name: 'Annual Summit',
  venue_name: 'Grand Hotel',
  timezone: 'Africa/Lagos',
  starts_on: EVENT_DAY,
  ends_on: EVENT_LAST_DAY,
}

describe('coordination desk phone', () => {
  let app: TestApp
  let manager: StaffMember
  let admin: StaffMember
  let coordinator: StaffMember
  let driver: StaffMember

  beforeAll(async () => {
    app = await TestApp.start()
    manager = await app.createStaff('programme_manager')
    admin = await app.createStaff('admin')
    coordinator = await app.createStaff('coordinator')
    driver = await app.createStaff('driver', { name: 'Ada Obi' })
  })
  afterAll(async () => {
    await app.stop()
  })

  const patch = (as: StaffMember, body: unknown) => app.call<{ coordinator_phone: string | null }>(patchEvent, '/api/admin/event', { as, method: 'PATCH', body })
  const pickups = () => app.call<{ coordinator_phone: string | null }>(driverPickups, `/api/driver/pickups?day=${EVENT_DAY}`, { as: driver })

  it('normalises the number when the event is set up', async () => {
    const created = await app.call<{ coordinator_phone: string | null }>(createEvent, '/api/events', {
      as: manager,
      body: { ...EVENT, coordinator_phone: '0803 555 0142' },
    })
    expect(created.status).toBe(201)
    expect(created.body.data.coordinator_phone).toBe('+2348035550142')
    // A driver record belongs to the event, so link the driver once the event exists.
    await addDriver(app, 'Ada Obi', 4, driver.id)
  })

  it('validates the number and keeps it to admins', async () => {
    const bad = await patch(admin, { coordinator_phone: 'call reception' })
    expect(bad.status).toBe(400)

    const byCoordinator = await patch(coordinator, { coordinator_phone: '+2348035550199' })
    expect(byCoordinator.status).toBe(403)

    const updated = await patch(admin, { coordinator_phone: '+44 20 7946 0958' })
    expect(updated.status).toBe(200)
    expect(updated.body.data.coordinator_phone).toBe('+442079460958')
  })

  it('gives drivers the number with their trips, but not the event settings', async () => {
    const result = await pickups()
    expect(result.status).toBe(200)
    expect(result.body.data.coordinator_phone).toBe('+442079460958')

    expect((await app.call(getEvent, '/api/admin/event', { as: driver })).status).toBe(403)
  })

  it('clears the number when left blank', async () => {
    const cleared = await patch(admin, { coordinator_phone: '  ' })
    expect(cleared.status).toBe(200)
    expect(cleared.body.data.coordinator_phone).toBeNull()

    expect((await pickups()).body.data.coordinator_phone).toBeNull()

    const nulled = await patch(admin, { coordinator_phone: null })
    expect(nulled.status).toBe(200)
  })
})
