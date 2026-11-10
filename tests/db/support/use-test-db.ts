import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { TestDb } from './test-db'

/**
 * One migrated database per test file; every test runs in a transaction that is rolled back.
 * Returns an accessor because the database is created asynchronously in beforeAll.
 */
export function useTestDb(): () => TestDb {
  let db: TestDb | undefined

  beforeAll(async () => {
    db = await TestDb.create()
  })
  afterAll(async () => {
    await db?.close()
  })
  beforeEach(async () => {
    db?.resetOptions()
    await db?.begin()
  })
  afterEach(async () => {
    await db?.rollback()
  })

  return () => {
    if (!db) {
      throw new Error('Test database is not ready')
    }
    return db
  }
}
