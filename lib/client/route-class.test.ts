import { describe, expect, it } from 'vitest'
import { routeClass } from './route-class'

describe('routeClass', () => {
  it('uses the first path segment for list screens', () => {
    expect(routeClass('/dashboard')).toBe('dashboard')
    expect(routeClass('/guests')).toBe('guests')
    expect(routeClass('/settings')).toBe('settings')
  })

  it('maps detail screens to the design names', () => {
    expect(routeClass('/guests/7b1c')).toBe('profile')
    expect(routeClass('/intake/VIP-7K3Q')).toBe('review')
    expect(routeClass('/rooms/plan/3f2a')).toBe('allocation')
    expect(routeClass('/rooms')).toBe('rooms')
  })

  it('falls back to the dashboard for the root', () => {
    expect(routeClass('/')).toBe('dashboard')
  })
})
