import { describe, expect, it } from 'vitest'
import { parseNotificationEvent } from './realtime'

describe('parseNotificationEvent', () => {
  it('reads the id, kind and priority the server sends', () => {
    expect(parseNotificationEvent(JSON.stringify({ id: 'n-1', kind: 'flight_delayed', priority: 'high' }))).toEqual({
      id: 'n-1',
      kind: 'flight_delayed',
      priority: 'high',
    })
  })

  it('treats any priority other than high as normal', () => {
    expect(parseNotificationEvent(JSON.stringify({ id: 'n-2', kind: 'room_ready' }))?.priority).toBe('normal')
    expect(parseNotificationEvent(JSON.stringify({ id: 'n-3', kind: 'room_ready', priority: 'urgent' }))?.priority).toBe('normal')
  })

  it('ignores malformed events', () => {
    expect(parseNotificationEvent('not json')).toBeNull()
    expect(parseNotificationEvent(JSON.stringify({ kind: 'room_ready' }))).toBeNull()
    expect(parseNotificationEvent(JSON.stringify({ id: 7, kind: 'room_ready' }))).toBeNull()
    expect(parseNotificationEvent('null')).toBeNull()
  })
})
