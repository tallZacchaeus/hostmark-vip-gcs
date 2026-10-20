'use client'
// "Registration received" (FR-IN-03): the reference code, a short summary and, when a coordinator
// will check something first, a note that they may get in touch.
import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatShortDay } from '@/lib/client/format'
import { useReceipt, type RegistrationReceipt } from './receipt'

const COPIED_MS = 2_000

function arrivalLine(summary: RegistrationReceipt['summary']): string | null {
  if (!summary.arrival_date) return null
  const day = formatShortDay(`${summary.arrival_date}T12:00:00Z`, 'UTC')
  if (summary.arrival_mode === 'flying') return `Arriving ${day}${summary.flight_number ? ` by ${summary.flight_number}` : ' by air'}`
  if (summary.arrival_mode === 'pickup') return `Pickup on ${day}`
  return `Arriving ${day} by road`
}

function ReferenceBox({ code }: { readonly code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      // Clipboard access can be refused; the code stays on screen to copy by hand.
    }
  }
  return (
    <div className="confirmation-reference">
      <span>
        <small>Your reference</small>
        <b>{code}</b>
      </span>
      <button type="button" className={copied ? 'is-copied' : ''} onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} size={17} />
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}

export function ConfirmationScreen({ token }: { readonly token: string }) {
  const receipt = useReceipt(token)
  const arrival = receipt ? arrivalLine(receipt.summary) : null
  const companions = receipt?.summary.companions ?? 0
  return (
    <main className="confirmation-page">
      <div className="confirmation-public-wrap">
        <div className="confirmation-logo">
          <img src="/hostmark-logo-C.svg" alt="" width={34} height={34} />
          <b>
            <span>Host</span>mark
          </b>
        </div>
        <section className="public-confirmation" aria-labelledby="confirmation-title">
          <span className="confirmation-check" aria-hidden="true">
            <Icon name="check" size={34} />
          </span>
          <h1 id="confirmation-title">Registration received</h1>
          <p>Thank you. The coordination team will confirm by email.</p>
          {receipt ? (
            <>
              <ReferenceBox code={receipt.reference_code} />
              <div className="confirmation-summary">
                <p>
                  <Icon name="users" size={19} />
                  <b>
                    {receipt.summary.guest}
                    {companions > 0 && ` and ${companions} ${companions === 1 ? 'guest' : 'guests'}`}
                  </b>
                </p>
                {arrival && (
                  <p>
                    <Icon name={receipt.summary.arrival_mode === 'flying' ? 'plane' : 'car'} size={19} />
                    <b>{arrival}</b>
                  </p>
                )}
              </div>
              {receipt.follow_up && (
                <aside className="confirmation-note">
                  <Icon name="info" size={18} />
                  <span>We may contact you about a few details.</span>
                </aside>
              )}
              <p className="confirmation-keep">Keep this reference. Quote it if you need to change anything.</p>
            </>
          ) : (
            <p className="confirmation-keep">Keep the reference code you were shown. Quote it if you need to change anything.</p>
          )}
          <Link className="register-another" href={`/register/${encodeURIComponent(token)}`}>
            Register another delegation
          </Link>
        </section>
      </div>
    </main>
  )
}
