import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordScreen } from './ForgotPasswordScreen'
import { ResetPasswordScreen } from './ResetPasswordScreen'

function stubFetch(status: number, body: unknown = { status: true }) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const sentBody = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return { url, body: JSON.parse(String(init.body)) as unknown }
}

describe('ForgotPasswordScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for a link and gives the same answer whether or not the address is known', async () => {
    // Arrange
    const fetchMock = stubFetch(200)
    const user = userEvent.setup()
    render(<ForgotPasswordScreen />)

    // Act
    await user.type(screen.getByLabelText('Email'), ' ada@example.com ')
    await user.click(screen.getByRole('button', { name: 'Email me a link' }))

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('If an account uses ada@example.com, a link to choose a new password is on its way.')
    expect(sentBody(fetchMock)).toEqual({ url: '/api/auth/request-password-reset', body: { email: 'ada@example.com' } })
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/sign-in')
  })

  it('needs an email before asking and explains a rate limit', async () => {
    // Arrange
    const fetchMock = stubFetch(429)
    const user = userEvent.setup()
    render(<ForgotPasswordScreen />)

    // Act + Assert
    await user.click(screen.getByRole('button', { name: 'Email me a link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email.')
    expect(fetchMock).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Email me a link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.')
  })
})

describe('ResetPasswordScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function choose(password: string, confirm = password) {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('New password'), password)
    await user.type(screen.getByLabelText('Confirm new password'), confirm)
    return user
  }

  it('sets the password with the link token, then points to sign-in', async () => {
    // Arrange
    const fetchMock = stubFetch(200)
    render(<ResetPasswordScreen token="tok_123" />)

    // Act
    const user = await choose('Chosen-Password-2026')
    await user.click(screen.getByRole('button', { name: 'Save password' }))

    // Assert
    expect(await screen.findByRole('status')).toHaveTextContent('Your password is set.')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(sentBody(fetchMock)).toEqual({ url: '/api/auth/reset-password', body: { token: 'tok_123', newPassword: 'Chosen-Password-2026' } })
  })

  it('keeps Save disabled until the rules are met and both passwords match', async () => {
    // Arrange
    stubFetch(200)
    render(<ResetPasswordScreen token="tok_123" />)

    // Act + Assert
    await choose('short', 'short')
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled()
  })

  it('explains an expired or used link and offers a new one', async () => {
    // Arrange
    stubFetch(400, { code: 'INVALID_TOKEN' })
    render(<ResetPasswordScreen token="old" />)

    // Act
    const user = await choose('Chosen-Password-2026')
    await user.click(screen.getByRole('button', { name: 'Save password' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired or was already used.')
    expect(screen.getByRole('link', { name: 'Get a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('says so when the page was opened without a token', () => {
    render(<ResetPasswordScreen token="" />)
    expect(screen.getByRole('alert')).toHaveTextContent('This link is incomplete.')
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })
})
