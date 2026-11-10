import { describe, expect, it } from 'vitest'
import { passwordLinkEmail, registrationReceivedEmail } from './templates'

const LINK = 'https://hostmark.tech/reset-password?token=abc123'

describe('passwordLinkEmail', () => {
  it('invites a new staff member with their role and a set-password link', () => {
    // Act
    const mail = passwordLinkEmail({ kind: 'invite', name: 'Ada Obi', roleLabel: 'Event coordinator', link: LINK, validHours: 72 })

    // Assert
    expect(mail.subject).toBe('Your Hostmark account: set your password')
    expect(mail.text).toContain('Event coordinator')
    expect(mail.text).toContain(LINK)
    expect(mail.text).toContain('72 hours')
    expect(mail.html).toContain(`href="${LINK}"`)
  })

  it('words an admin reset and a self-service reset differently', () => {
    // Act
    const admin = passwordLinkEmail({ kind: 'admin_reset', name: 'Ada', link: LINK, validHours: 72 })
    const self = passwordLinkEmail({ kind: 'forgot', name: 'Ada', link: LINK, validHours: 1 })

    // Assert
    expect(admin.text).toContain('An administrator reset your password')
    expect(self.subject).toBe('Reset your Hostmark password')
    expect(self.text).toContain('1 hour')
    expect(self.text).toContain('If you did not ask')
  })

  it('escapes names in the HTML body', () => {
    // Act
    const mail = passwordLinkEmail({ kind: 'invite', name: '<script>x</script>', roleLabel: 'Driver', link: LINK, validHours: 72 })

    // Assert
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })
})

describe('registrationReceivedEmail', () => {
  const base = {
    guest: 'Dr Chioma Eze',
    eventName: 'Lagos Leadership Summit',
    venueName: 'Eko Hotel',
    referenceCode: 'REG-7K2P',
    followUp: false,
    arrivalDate: '2026-12-10',
    flightNumber: 'ET900',
  }

  it('confirms the reference, event and arrival details', () => {
    // Act
    const mail = registrationReceivedEmail(base)

    // Assert
    expect(mail.subject).toBe('Registration received: Lagos Leadership Summit (REG-7K2P)')
    expect(mail.text).toContain('Dr Chioma Eze')
    expect(mail.text).toContain('REG-7K2P')
    expect(mail.text).toContain('Eko Hotel')
    expect(mail.text).toContain('ET900')
    expect(mail.text).toContain('2026-12-10')
    expect(mail.text).not.toContain('may contact you')
  })

  it('says the organisers may get in touch when something needs checking, and leaves out missing details', () => {
    // Act
    const mail = registrationReceivedEmail({ ...base, followUp: true, arrivalDate: null, flightNumber: null })

    // Assert
    expect(mail.text).toContain('may contact you')
    expect(mail.text).not.toContain('Flight')
    expect(mail.html).not.toContain('Flight')
  })
})
