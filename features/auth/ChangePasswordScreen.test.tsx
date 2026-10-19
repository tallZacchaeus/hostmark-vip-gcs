import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChangePasswordScreen } from './ChangePasswordScreen'

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

async function fillIn(current: string, next: string, confirm: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Temporary password'), current)
  await user.type(screen.getByLabelText('New password'), next)
  await user.type(screen.getByLabelText('Confirm new password'), confirm)
  return user
}

describe('ChangePasswordScreen', () => {
  it('keeps Save disabled until every rule is met and both entries match', async () => {
    render(<ChangePasswordScreen email="ada@example.com" forced homeRoute="/dashboard" />)
    const save = screen.getByRole('button', { name: 'Save and continue' })
    expect(save).toBeDisabled()

    await fillIn('Temp-Pass-123', 'weakpass', 'weakpass')
    expect(save).toBeDisabled()
    expect(screen.getByText('One number').closest('p')).not.toHaveClass('is-met')
  })

  it('posts the change and reports a wrong temporary password', async () => {
    const fetchMock = respond(400, { success: false, data: null, error: { code: 'invalid_password', message: 'The current password is wrong' } })
    vi.stubGlobal('fetch', fetchMock)
    render(<ChangePasswordScreen email="ada@example.com" forced homeRoute="/dashboard" />)

    const user = await fillIn('Wrong-Pass-1', 'Securepass1', 'Securepass1')
    const save = screen.getByRole('button', { name: 'Save and continue' })
    expect(save).toBeEnabled()
    await user.click(save)

    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is wrong')
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/account/password')
    expect(JSON.parse(String(init.body))).toEqual({ current_password: 'Wrong-Pass-1', new_password: 'Securepass1' })
    vi.unstubAllGlobals()
  })

  it('names the field as the current password when the change is voluntary', async () => {
    render(<ChangePasswordScreen email="ada@example.com" forced={false} homeRoute="/dashboard" />)
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument())
  })
})
