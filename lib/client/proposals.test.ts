import { afterEach, describe, expect, it, vi } from 'vitest'
import { decideProposal, failureMessage } from './proposals'

const respond = (data: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data, error: null }), { status: 200, headers: { 'content-type': 'application/json' } }))

describe('decideProposal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports approvals and rejections', async () => {
    const fetchSpy = respond({ status: 'approved' })
    expect(await decideProposal('p1', 'Assign Ada', true)).toEqual({ ok: true, message: 'Approved: Assign Ada' })
    expect(fetchSpy.mock.calls[0]?.[0]).toContain('/api/proposals/p1/approve')
    respond({ status: 'rejected' })
    expect(await decideProposal('p1', 'Assign Ada', false)).toEqual({ ok: true, message: 'Rejected: Assign Ada' })
  })

  it('explains a proposal the database could not carry out', async () => {
    respond({ status: 'failed', error: 'driver_busy' })
    expect(await decideProposal('p1', 'Assign Ada', true)).toEqual({ ok: false, message: 'Not carried out: That driver is now busy at that time. Ask for a new suggestion.' })
    respond({ status: 'expired' })
    expect((await decideProposal('p1', 'Assign Ada', true)).ok).toBe(false)
  })

  it('has a fallback for unknown failure codes', () => {
    expect(failureMessage('something_new')).toBe('It no longer fits the current plan.')
    expect(failureMessage(undefined)).toBe('It no longer fits the current plan.')
  })
})
