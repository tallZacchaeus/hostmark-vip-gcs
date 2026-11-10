import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInScreen } from './SignInScreen'

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

interface Reply {
  readonly status: number
  readonly body: unknown
}

/** Answers Better Auth's sign-in endpoint and /api/me like the real server. */
function stubServer(signInReply: Reply, me: unknown = { home_route: '/dashboard', user: { must_change_password: false } }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/auth/sign-in/email') return Response.json(signInReply.body, { status: signInReply.status })
    if (url === '/api/me') return Response.json({ success: true, data: me, error: null })
    return Response.json({ success: false, data: null, error: { code: 'not_found', message: url } }, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function signInAs(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('SignInScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    router.replace.mockReset()
    router.refresh.mockReset()
  })

  it('shows the brand and asks for both fields before contacting the server', async () => {
    const fetchMock = stubServer({ status: 200, body: {} })
    const user = userEvent.setup()
    render(<SignInScreen />)

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByText('mark')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password.')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'signin-error')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Email'), 'a')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('signs in with the trimmed email and goes to the home screen for the role', async () => {
    const fetchMock = stubServer({ status: 200, body: { token: 'session' } }, { home_route: '/programme', user: { must_change_password: false } })
    render(<SignInScreen />)

    await signInAs('  ada@example.com ', 'Securepass1')

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/programme'))
    expect(router.refresh).toHaveBeenCalled()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ada@example.com', password: 'Securepass1' })
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })

  it('sends people with a temporary password to choose their own first', async () => {
    stubServer({ status: 200, body: {} }, { home_route: '/dashboard', user: { must_change_password: true } })
    render(<SignInScreen />)
    await signInAs('ada@example.com', 'Temp-Pass-123')
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account/password'))
  })

  it('says the details are wrong when the server refuses them, and lets the person try again', async () => {
    stubServer({ status: 401, body: { code: 'INVALID_EMAIL_OR_PASSWORD' } })
    render(<SignInScreen />)
    await signInAs('ada@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('names a deactivated account when sent back with that reason', () => {
    const { unmount } = render(<SignInScreen reason="inactive" />)
    expect(screen.getByRole('alert')).toHaveTextContent('This account has been deactivated. Ask your coordinator if you need access again.')
    unmount()
    render(<SignInScreen reason="something-else" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains how to recover a forgotten password', async () => {
    render(<SignInScreen />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('status')).toHaveTextContent('Ask your coordinator or an admin to reset your password.')
  })

  it('links "Forgot password?" to the email reset page when email is on', () => {
    render(<SignInScreen emailResets />)
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows and hides the password on request', async () => {
    const user = userEvent.setup()
    render(<SignInScreen />)
    const password = screen.getByLabelText('Password')
    await user.type(password, 'Securepass1')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })
})
