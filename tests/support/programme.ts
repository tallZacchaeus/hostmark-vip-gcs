// Programme fixtures for the Programme screen tests.
import type { ProgrammeView, ProgramItemView, ProgramParticipant } from '@/lib/repositories/programme'

export const participant = (overrides: Partial<ProgramParticipant>): ProgramParticipant => ({
  guest_id: 'g-1',
  delegation_id: 'd-1',
  name: 'Bishop Augustine Okafor',
  role: 'speaker',
  category: 'Cat. 1',
  expected_at: '2026-10-28T15:55:00.000Z',
  arrived: false,
  late: false,
  ...overrides,
})

export const programItem = (overrides: Partial<ProgramItemView>): ProgramItemView => ({
  id: 'p-1',
  title: 'Welcome briefing',
  kind: 'session',
  starts_at: '2026-10-28T16:00:00.000Z',
  ends_at: '2026-10-28T17:00:00.000Z',
  location: 'Conference hall A',
  description: null,
  status: 'published',
  at_risk: false,
  state: 'track',
  risk_notified_at: null,
  participants: [],
  ...overrides,
})

export const programmeView = (overrides: Partial<ProgrammeView>): ProgrammeView => ({
  day: '2026-10-28',
  days: ['2026-10-28', '2026-10-29', '2026-10-30'],
  outside_days: [],
  timezone: 'Africa/Lagos',
  lead_time_min: 30,
  can_edit: false,
  at_risk_count: 0,
  venues: [],
  items: [],
  ...overrides,
})
