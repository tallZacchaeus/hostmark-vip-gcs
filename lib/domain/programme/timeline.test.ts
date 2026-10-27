import { describe, expect, it } from 'vitest'
import { eventDays, itemState, venueCounts } from './timeline'

const NOW = Date.parse('2026-11-20T12:00:00Z')

describe('eventDays', () => {
  it('lists every day of the event, inclusive', () => {
    expect(eventDays('2026-11-20', '2026-11-22')).toEqual(['2026-11-20', '2026-11-21', '2026-11-22'])
    expect(eventDays('2026-11-20', '2026-11-20')).toEqual(['2026-11-20'])
  })

  it('returns nothing for a reversed range', () => {
    expect(eventDays('2026-11-22', '2026-11-20')).toEqual([])
  })
})

describe('itemState', () => {
  const item = { status: 'published' as const, at_risk: false, ends_at: '2026-11-20T14:00:00Z' }

  it('is on track, at risk, done or cancelled (Figma timeline)', () => {
    expect(itemState(item, NOW)).toBe('track')
    expect(itemState({ ...item, at_risk: true }, NOW)).toBe('risk')
    expect(itemState({ ...item, ends_at: '2026-11-20T11:00:00Z', at_risk: true }, NOW)).toBe('done')
    expect(itemState({ ...item, status: 'cancelled', at_risk: true }, NOW)).toBe('cancelled')
  })
})

describe('venueCounts', () => {
  it('counts live items per location, busiest first', () => {
    const items = [
      { location: 'Banquet hall', status: 'published' as const },
      { location: 'Conference hall A', status: 'draft' as const },
      { location: 'Banquet hall', status: 'published' as const },
      { location: 'Garden terrace', status: 'cancelled' as const },
    ]
    expect(venueCounts(items)).toEqual([
      { name: 'Banquet hall', count: 2 },
      { name: 'Conference hall A', count: 1 },
    ])
  })
})
