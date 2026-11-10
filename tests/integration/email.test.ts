import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as register } from '@/app/api/intake/[token]/route'
import { GET as me } from '@/app/api/me/route'
import { POST as resetPassword } from '@/app/api/admin/users/[id]/reset-password/route'
import { PATCH as patchUser } from '@/app/api/admin/users/[id]/route'
import { POST as createUser } from '@/app/api/admin/users/route'
import { setMailerForTesting } from '@/lib/mail/get-mailer'
import type { MailMessage, Mailer } from '@/lib/mail/mailer'
import { EVENT_DAY, EVENT_LAST_DAY } from '@/tests/support/event-dates'
import { MAIL_OFF, type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

const NEW_PASSWORD = 'Chosen-Password-2026'

/** A mailer that records what it would send, and can be told to fail. */
function recordingMailer(ok = true): Mailer & { readonly sent: MailMessage[] } {
  const sent: MailMessage[] = []
  return {
    enabled: true,
    sent,
    async send(message) {
      sent.push(message)
      return ok ? { ok: true, id: `email-${sent.length}` } : { ok: false, reason: 'rejected_500' }
    },
  }
}

function linkToken(message: MailMessage | undefined): string {
  const match = message?.text.match(/\/reset-password\?token=([A-Za-z0-9_-]+)/)
  if (!match?.[1]) throw new Error('No password link in the email')
  return match[1]
}

interface Created {
  account: { id: string; email: string; must_change_password: boolean }
  temporary_password: string | null
  password_delivery: 'emailed' | 'email_failed' | 'shown'
}

describe('email through Resend', () => {
  let app: TestApp
  let admin: StaffMember

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    admin = await app.createStaff('admin')
  })
  afterEach(() => {
    setMailerForTesting(MAIL_OFF)
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await app.stop()
  })

  const invite = (email: string) =>
    app.call<Created>(createUser, '/api/admin/users', { as: admin, body: { email, full_name: 'Ada Obi', role: 'coordinator' } })

  describe('staff invitations', () => {
    it('emails a set-password link instead of showing a password, and the link lets them in once', async () => {
      // Arrange
      const mailer = recordingMailer()
      setMailerForTesting(mailer)

      // Act
      const created = await invite('ada.invite@example.com')
      const token = linkToken(mailer.sent[0])
      await app.auth.api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } })

      // Assert
      expect(created.status).toBe(201)
      expect(created.body.data).toMatchObject({ temporary_password: null, password_delivery: 'emailed' })
      expect(mailer.sent).toHaveLength(1)
      expect(mailer.sent[0]).toMatchObject({ to: 'ada.invite@example.com', subject: 'Your Hostmark account: set your password' })
      expect(mailer.sent[0]?.text).toContain('http://localhost:3000/reset-password?token=')
      const signedIn = await app.signIn('ada.invite@example.com', NEW_PASSWORD)
      const profile = await app.call<{ user: { must_change_password: boolean } }>(me, '/api/me', {
        as: { ...admin, id: created.body.data.account.id, token: signedIn },
      })
      expect(profile.body.data.user.must_change_password).toBe(false)
      await expect(app.auth.api.resetPassword({ body: { token, newPassword: 'Another-Password-2026' } })).rejects.toThrow()
    })

    it('falls back to a temporary password on screen when the email cannot be sent', async () => {
      // Arrange
      setMailerForTesting(recordingMailer(false))

      // Act
      const created = await invite('ada.fallback@example.com')

      // Assert
      expect(created.status).toBe(201)
      expect(created.body.data.password_delivery).toBe('email_failed')
      expect(created.body.data.temporary_password).toMatch(/^.{14}$/)
      await expect(app.signIn('ada.fallback@example.com', created.body.data.temporary_password ?? '')).resolves.toBeTruthy()
    })

    it('cancels an outstanding link when the account is deactivated', async () => {
      // Arrange
      const mailer = recordingMailer()
      setMailerForTesting(mailer)
      const created = await invite('ada.leaver@example.com')
      const id = created.body.data.account.id

      // Act
      await app.call(patchUser, `/api/admin/users/${id}`, { as: admin, method: 'PATCH', params: { id }, body: { active: false } })

      // Assert
      await expect(app.auth.api.resetPassword({ body: { token: linkToken(mailer.sent[0]), newPassword: NEW_PASSWORD } })).rejects.toThrow()
    })

    it('leaves no working link behind when the invitation email fails', async () => {
      // Arrange
      setMailerForTesting(recordingMailer(false))

      // Act
      const created = await invite('ada.nolink@example.com')

      // Assert
      const links = await app.sql(`select 1 from auth_verifications where identifier like 'reset-password:%' and value = $1`, [created.body.data.account.id])
      expect(links).toHaveLength(0)
    })

    it('shows the temporary password, as before, when email is not configured', async () => {
      // Act
      const created = await invite('ada.nomail@example.com')

      // Assert
      expect(created.body.data.password_delivery).toBe('shown')
      expect(created.body.data.temporary_password).toMatch(/^.{14}$/)
    })
  })

  describe('password resets', () => {
    it('emails a new-password link when an admin resets an account, and the old password stops working', async () => {
      // Arrange
      const mailer = recordingMailer()
      setMailerForTesting(mailer)
      const driver = await app.createStaff('driver')

      // Act
      const reset = await app.call<{ temporary_password: string | null; password_delivery: string }>(
        resetPassword,
        `/api/admin/users/${driver.id}/reset-password`,
        { as: admin, params: { id: driver.id } },
      )

      // Assert
      expect(reset.body.data).toEqual({ temporary_password: null, password_delivery: 'emailed' })
      expect(mailer.sent[0]).toMatchObject({ to: driver.email, subject: 'Set a new Hostmark password' })
      await expect(app.signIn(driver.email, driver.password)).rejects.toThrow()
      await app.auth.api.resetPassword({ body: { token: linkToken(mailer.sent[0]), newPassword: NEW_PASSWORD } })
      await expect(app.signIn(driver.email, NEW_PASSWORD)).resolves.toBeTruthy()
    })

    it('sends "Forgot password?" links to active accounts only, and says the same for every address', async () => {
      // Arrange
      const mailer = recordingMailer()
      setMailerForTesting(mailer)
      const active = await app.createStaff('housekeeping')
      const deactivated = await app.createStaff('housekeeping', { banned: true })

      // Act
      const replies = [
        await app.auth.api.requestPasswordReset({ body: { email: active.email } }),
        await app.auth.api.requestPasswordReset({ body: { email: deactivated.email } }),
        await app.auth.api.requestPasswordReset({ body: { email: 'nobody@example.com' } }),
      ]

      // Assert
      expect(new Set(replies.map((reply) => reply.message)).size).toBe(1)
      expect(mailer.sent.map((message) => message.to)).toEqual([active.email])
      expect(mailer.sent[0]?.subject).toBe('Reset your Hostmark password')
      await app.auth.api.resetPassword({ body: { token: linkToken(mailer.sent[0]), newPassword: NEW_PASSWORD } })
      await expect(app.signIn(active.email, NEW_PASSWORD)).resolves.toBeTruthy()
    })
  })

  describe('guest registration confirmations', () => {
    let token: string
    let ipCounter = 0
    const submit = (form: object) =>
      app.call<{ reference_code: string }>(register, `/api/intake/${token}`, {
        body: { form, consent: true },
        params: { token },
        headers: { 'x-forwarded-for': `203.0.113.${(ipCounter += 1)}` },
      })
    const FORM = {
      full_name: 'Chioma Eze',
      contact_name: 'Chioma Eze',
      contact_email: 'Chioma@Example.org',
      contact_phone: '',
      arrival_mode: 'own_transport',
      arrival_date: EVENT_DAY,
      arrival_time: '14:30',
      departure_date: EVENT_LAST_DAY,
    }

    beforeAll(async () => {
      const [event] = await app.sql<{ intake_token: string }>('update events set intake_open = true returning intake_token')
      token = event?.intake_token ?? ''
    })

    it('emails the guest their reference after registering', async () => {
      // Arrange
      const mailer = recordingMailer()
      setMailerForTesting(mailer)

      // Act
      const result = await submit(FORM)

      // Assert
      expect(result.status).toBe(201)
      const reference = result.body.data.reference_code
      expect(mailer.sent).toHaveLength(1)
      expect(mailer.sent[0]?.to).toBe('chioma@example.org')
      expect(mailer.sent[0]?.subject).toBe(`Registration received: Annual Summit (${reference})`)
      expect(mailer.sent[0]?.text).toContain('Grand Hotel')
    })

    it('sends at most two confirmations a day to the same address, so the form cannot flood an inbox', async () => {
      // Arrange
      const mailer = recordingMailer()
      setMailerForTesting(mailer)

      // Act
      for (const name of ['Guest One', 'Guest Two', 'Guest Three']) {
        expect((await submit({ ...FORM, full_name: name, contact_name: name, contact_email: 'Target@Example.net' })).status).toBe(201)
      }

      // Assert
      expect(mailer.sent.map((message) => message.to)).toEqual(['target@example.net', 'target@example.net'])
    })

    it('still registers the guest when the email fails or no email address was given', async () => {
      // Arrange
      const failing = recordingMailer(false)
      setMailerForTesting(failing)

      // Act
      const failed = await submit({ ...FORM, full_name: 'Kwame Asante', contact_email: 'kwame@example.org' })
      const phoneOnly = await submit({ ...FORM, full_name: 'Efua Mensah', contact_email: '', contact_phone: '+233201234567' })

      // Assert
      expect(failed.status).toBe(201)
      expect(phoneOnly.status).toBe(201)
      expect(failing.sent.map((message) => message.to)).toEqual(['kwame@example.org'])
    })
  })
})
