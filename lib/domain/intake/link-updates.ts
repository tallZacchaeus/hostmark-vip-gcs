// What a reviewer may carry over when linking a submission to an existing delegation (03-App-Flow
// F3): contact details, dietary needs and extra companions. Nothing is copied unless ticked, and
// nothing existing is removed. Arrival details are not copied: flight times come from tracking,
// and moving a party to another flight is a separate change.
import type { NormalizedIntake, NormalizedMember } from './normalize'

export const LINK_UPDATES = ['contact', 'dietary', 'companions'] as const
export type LinkUpdate = (typeof LINK_UPDATES)[number]

export interface ExistingDelegation {
  readonly contact_name: string | null
  readonly contact_email: string | null
  readonly contact_phone: string | null
  readonly principal_dietary: readonly string[]
  /** Names of the party members other than the principal (null for unnamed ones). */
  readonly member_names: readonly (string | null)[]
}

export interface ContactUpdate {
  readonly contact_name?: string
  readonly contact_email?: string
  readonly contact_phone?: string
}

export interface LinkUpdatePlan {
  readonly contact: ContactUpdate | null
  readonly dietary: string[] | null
  readonly newMembers: NormalizedMember[]
}

const key = (value: string): string => value.trim().toLowerCase()

function planContact(existing: ExistingDelegation, incoming: NormalizedIntake): ContactUpdate | null {
  const candidates = {
    contact_name: incoming.contact_name.trim() || null,
    contact_email: incoming.contact_email,
    contact_phone: incoming.contact_phone,
  }
  const changes = Object.fromEntries(
    Object.entries(candidates).filter(([field, value]) => value && key(value) !== key(existing[field as keyof typeof candidates] ?? '')),
  ) as ContactUpdate
  return Object.keys(changes).length > 0 ? changes : null
}

function planDietary(existing: ExistingDelegation, incoming: NormalizedIntake): string[] | null {
  const known = new Set(existing.principal_dietary.map(key))
  const added = incoming.dietary.filter((item, index, all) => !known.has(key(item)) && all.findIndex((other) => key(other) === key(item)) === index)
  return added.length > 0 ? [...existing.principal_dietary, ...added] : null
}

function planMembers(existing: ExistingDelegation, incoming: NormalizedIntake): NormalizedMember[] {
  const room = incoming.party.length - existing.member_names.length
  if (room <= 0) return []
  const known = new Set(existing.member_names.filter((name): name is string => Boolean(name)).map(key))
  return incoming.party.filter((member) => !member.name || !known.has(key(member.name))).slice(0, room)
}

export function planLinkUpdates(existing: ExistingDelegation, incoming: NormalizedIntake, chosen: readonly LinkUpdate[]): LinkUpdatePlan {
  return {
    contact: chosen.includes('contact') ? planContact(existing, incoming) : null,
    dietary: chosen.includes('dietary') ? planDietary(existing, incoming) : null,
    newMembers: chosen.includes('companions') ? planMembers(existing, incoming) : [],
  }
}
