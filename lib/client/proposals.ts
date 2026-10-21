// Approving or rejecting a proposal from any screen. The database re-checks a proposal before
// carrying it out, so an approval can come back "failed" (the driver became busy) or "expired":
// those are outcomes to explain, not errors.
import { apiSend } from './api'

export interface DecisionOutcome {
  readonly ok: boolean
  readonly message: string
}

const FAILURES: Readonly<Record<string, string>> = {
  driver_busy: 'That driver is now busy at that time.',
  driver_off_shift: 'That driver is off shift at that time.',
  driver_inactive: 'That driver is no longer active.',
  not_enough_seats: 'The vehicles no longer seat everyone.',
  pickup_closed: 'The pickup is already under way, done or cancelled.',
  no_driver: 'The suggestion names no driver.',
  room_occupied: 'Someone else now has that room at that time.',
  room_capacity: 'The room no longer has enough beds.',
  room_not_ready: 'The room cannot be cleaned before the guest arrives.',
  room_out_of_service: 'The room is out of service.',
  already_placed: 'The guest has been given a room in the meantime.',
  checked_in: 'The guest is already checked in.',
  guest_gone: 'The guest is no longer expected.',
}

export function failureMessage(code: string | undefined): string {
  return (code && FAILURES[code]) ?? 'It no longer fits the current plan.'
}

interface DecisionResponse {
  readonly status: 'approved' | 'rejected' | 'failed' | 'expired'
  readonly error?: string
}

export async function decideProposal(id: string, title: string, approve: boolean): Promise<DecisionOutcome> {
  const result = await apiSend<DecisionResponse>(`/api/proposals/${id}/${approve ? 'approve' : 'reject'}`, 'POST', {})
  switch (result.status) {
    case 'failed':
      return { ok: false, message: `Not carried out: ${failureMessage(result.error)} Ask for a new suggestion.` }
    case 'expired':
      return { ok: false, message: `This suggestion expired: ${title}` }
    default:
      return { ok: true, message: approve ? `Approved: ${title}` : `Rejected: ${title}` }
  }
}
