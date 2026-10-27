// Cleaning queue fixtures for the Sanitation and housekeeping screen tests.
import type { CleaningItem, CleaningView } from '@/lib/repositories/cleaning'

export const cleaningItem = (overrides: Partial<CleaningItem>): CleaningItem => ({
  task_id: 't-1',
  room_id: 'r-1',
  room_number: '217',
  floor: 2,
  wing: 'Garden',
  room_type: 'Twin',
  status: 'pending',
  checked_out_at: '2026-10-28T08:55:00.000Z',
  started_at: null,
  completed_at: null,
  needed_by: '2026-10-28T11:30:00.000Z',
  ready_by: '2026-10-28T10:30:00.000Z',
  late_by_min: 0,
  priority: 1,
  problem_kind: null,
  problem_note: null,
  undoable: false,
  ...overrides,
})

export const cleaningView = (overrides: Partial<CleaningView>): CleaningView => ({
  day: '2026-10-28',
  timezone: 'Africa/Lagos',
  summary: { not_started: 0, in_progress: 0, done_today: 0 },
  queue: [],
  done: [],
  ...overrides,
})
