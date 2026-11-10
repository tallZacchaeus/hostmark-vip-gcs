import { act, render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useApi } from '@/lib/client/use-api'
import { mockApi } from '@/tests/support/api-mock'
import { installEventSource } from '@/tests/support/event-source'
import { sessionFor } from '@/tests/support/render'
import { StaffShell } from './StaffShell'

function PickupCount() {
  const { data } = useApi<{ count: number }>('/api/driver/pickups')
  return <p>{data ? `${data.count} pickups` : 'Loading pickups'}</p>
}

describe('StaffShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('warns that flight data is simulated above the staff screens', () => {
    installEventSource()
    const { unmount } = render(<StaffShell session={sessionFor('driver', 'simulated')}>Driver home</StaffShell>)
    expect(screen.getByRole('note')).toHaveTextContent('Simulated mode')
    expect(screen.getByText('Driver home')).toBeInTheDocument()
    unmount()

    render(<StaffShell session={sessionFor('driver', 'live')}>Driver home</StaffShell>)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('refreshes the staff screen when the server announces a change', async () => {
    const latestStream = installEventSource()
    mockApi([{ path: '/api/driver/pickups', body: { count: 2 } }])
    render(
      <SWRConfig value={{ dedupingInterval: 0 }}>
        <StaffShell session={sessionFor('driver')}>
          <PickupCount />
        </StaffShell>
      </SWRConfig>,
    )
    expect(await screen.findByText('2 pickups')).toBeInTheDocument()

    mockApi([{ path: '/api/driver/pickups', body: { count: 3 } }])
    act(() => latestStream().emit('notification', JSON.stringify({ id: 'n-1', kind: 'pickup_assigned' })))
    expect(await screen.findByText('3 pickups')).toBeInTheDocument()
  })

  it('still works in browsers without live updates', () => {
    vi.stubGlobal('EventSource', undefined)
    render(<StaffShell session={sessionFor('housekeeping', 'live')}>Cleaning queue</StaffShell>)
    expect(screen.getByText('Cleaning queue')).toBeInTheDocument()
  })
})
