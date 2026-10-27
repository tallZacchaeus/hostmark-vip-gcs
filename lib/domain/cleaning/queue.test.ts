import { describe, expect, it } from 'vitest'
import { type CleaningTask, isLate, orderQueue, readyBy } from './queue'

const MINUTE = 60_000
const NOW = Date.parse('2026-11-22T11:00:00Z')
const at = (minutes: number) => NOW + minutes * MINUTE

function task(overrides: Partial<CleaningTask> = {}): CleaningTask {
  return {
    task_id: 't1',
    room_number: '412',
    status: 'pending',
    checked_out_at: NOW,
    estimated_ready_at: at(75),
    started_at: null,
    completed_at: null,
    cleaning_minutes: 60,
    buffer_minutes: 15,
    needed_by: null,
    ...overrides,
  }
}

describe('readyBy', () => {
  it('keeps the check-out estimate while it can still be met', () => {
    expect(readyBy(task({ checked_out_at: at(5), estimated_ready_at: at(80) }), NOW)).toBe(at(80))
  })

  it('moves a waiting room later once nobody has started in time', () => {
    expect(readyBy(task({ estimated_ready_at: at(-5) }), NOW)).toBe(at(75))
  })

  it('counts a started clean from when it started', () => {
    expect(readyBy(task({ status: 'in_progress', started_at: at(-50) }), NOW)).toBe(at(25))
  })

  it('never puts an overrunning clean in the past', () => {
    expect(readyBy(task({ status: 'in_progress', started_at: at(-90) }), NOW)).toBe(NOW)
  })

  it('uses the real time once the room is done', () => {
    expect(readyBy(task({ status: 'done', started_at: at(-60), completed_at: at(-3) }), NOW)).toBe(at(-3))
  })
})

describe('isLate', () => {
  it('flags a room expected to be ready after the next guests arrive', () => {
    expect(isLate(task({ needed_by: at(70) }), NOW)).toBe(true)
    expect(isLate(task({ needed_by: at(80) }), NOW)).toBe(false)
    expect(isLate(task(), NOW)).toBe(false)
  })
})

describe('orderQueue', () => {
  it('puts rooms being cleaned first, then the soonest incoming guests, then the earliest ready (FR-CL-04)', () => {
    const queue = orderQueue(
      [
        task({ task_id: 'no-guest', room_number: '201' }),
        task({ task_id: 'later', room_number: '409', needed_by: at(180) }),
        task({ task_id: 'soon', room_number: '217', needed_by: at(90) }),
        task({ task_id: 'busy', room_number: '504', status: 'in_progress', started_at: at(-5), needed_by: at(300) }),
        task({ task_id: 'no-guest-late', room_number: '101', estimated_ready_at: at(90) }),
      ],
      NOW,
    )

    expect(queue.map((item) => item.task_id)).toEqual(['busy', 'soon', 'later', 'no-guest', 'no-guest-late'])
    expect(queue.map((item) => item.priority)).toEqual([1, 2, 3, 4, 5])
    expect(queue[1]).toMatchObject({ ready_by: at(75), late_by_min: 0 })
  })

  it('says how late a room will be', () => {
    const [item] = orderQueue([task({ needed_by: at(60) })], NOW)
    expect(item).toMatchObject({ late_by_min: 15 })
  })

  it('leaves done rooms out of the queue', () => {
    expect(orderQueue([task({ status: 'done', completed_at: at(-1) })], NOW)).toEqual([])
  })
})
