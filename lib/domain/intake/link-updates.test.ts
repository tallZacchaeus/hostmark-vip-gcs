import { describe, expect, it } from 'vitest'
import { type ExistingDelegation, planLinkUpdates } from './link-updates'
import type { NormalizedIntake, NormalizedMember } from './normalize'

const EXISTING: ExistingDelegation = {
  contact_name: 'Grace Adeyemi',
  contact_email: 'office@diocese.example',
  contact_phone: '+2348035550142',
  principal_dietary: ['Vegetarian'],
  member_names: ['Chidi Nwosu'],
}

const member = (name: string | null, role: NormalizedMember['role'] = 'assistant'): NormalizedMember => ({ title: '', name, role, dietary: [], accessibility: '' })

const incoming = (overrides: Partial<NormalizedIntake>): NormalizedIntake =>
  ({ contact_name: '', contact_email: null, contact_phone: null, dietary: [], party: [], ...overrides }) as NormalizedIntake

describe('planLinkUpdates', () => {
  it('changes nothing that was not ticked', () => {
    const plan = planLinkUpdates(EXISTING, incoming({ contact_phone: '+2348035550199', dietary: ['Halal'], party: [member('Ada Obi')] }), [])
    expect(plan).toEqual({ contact: null, dietary: null, newMembers: [] })
  })

  it('copies only the contact details the submission actually has, never blanking existing ones', () => {
    const plan = planLinkUpdates(EXISTING, incoming({ contact_name: '', contact_email: null, contact_phone: '+2348035550199' }), ['contact'])
    expect(plan.contact).toEqual({ contact_phone: '+2348035550199' })
  })

  it('leaves contact details alone when they are the same', () => {
    expect(planLinkUpdates(EXISTING, incoming({ contact_phone: '+2348035550142' }), ['contact']).contact).toBeNull()
  })

  it('adds new dietary needs to the existing ones without duplicates', () => {
    const plan = planLinkUpdates(EXISTING, incoming({ dietary: ['vegetarian', 'No pork'] }), ['dietary'])
    expect(plan.dietary).toEqual(['Vegetarian', 'No pork'])
    expect(planLinkUpdates(EXISTING, incoming({ dietary: ['VEGETARIAN'] }), ['dietary']).dietary).toBeNull()
  })

  it('adds only companions who are not already in the party', () => {
    const plan = planLinkUpdates(EXISTING, incoming({ party: [member('chidi nwosu'), member('Ada Obi', 'family'), member(null, 'security')] }), ['companions'])
    expect(plan.newMembers.map((added) => [added.name, added.role])).toEqual([
      ['Ada Obi', 'family'],
      [null, 'security'],
    ])
  })

  it('never adds more companions than the submission brings beyond the current party', () => {
    const plan = planLinkUpdates({ ...EXISTING, member_names: ['Chidi Nwosu', 'Ada Obi'] }, incoming({ party: [member(null), member(null)] }), ['companions'])
    expect(plan.newMembers).toEqual([])
  })
})
