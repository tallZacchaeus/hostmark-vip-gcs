import { describe, expect, it } from 'vitest'
import { redirectTargetFor } from './page-guard'
import { COORDINATOR_PLUS } from './roles'
import type { Actor } from './session'

const actor = (overrides: Partial<Actor> = {}): { status: 'active'; actor: Actor } => ({
  status: 'active',
  actor: { id: 'u1', email: 'a@example.com', fullName: 'Ada', role: 'coordinator', mustChangePassword: false, ...overrides },
})

describe('redirectTargetFor', () => {
  it('sends anonymous visitors to sign in', () => {
    expect(redirectTargetFor({ status: 'anonymous' }, COORDINATOR_PLUS)).toBe('/sign-in')
  })

  it('explains deactivated accounts on the sign-in page', () => {
    expect(redirectTargetFor({ status: 'inactive' }, COORDINATOR_PLUS)).toBe('/sign-in?reason=inactive')
  })

  it('forces a temporary password to be changed first', () => {
    expect(redirectTargetFor(actor({ mustChangePassword: true }), COORDINATOR_PLUS)).toBe('/account/password')
    expect(redirectTargetFor(actor({ mustChangePassword: true }), COORDINATOR_PLUS, { allowPendingPasswordChange: true })).toBeNull()
  })

  it('sends a role that may not open the page to the forbidden page with its home', () => {
    expect(redirectTargetFor(actor({ role: 'driver' }), COORDINATOR_PLUS)).toBe('/forbidden?home=%2Fdriver')
  })

  it('lets an allowed role through', () => {
    expect(redirectTargetFor(actor(), COORDINATOR_PLUS)).toBeNull()
  })
})
