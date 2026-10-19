// The sign-in backdrop from the design: a dusk skyline behind a white card.
import type { ReactNode } from 'react'

const BUILDINGS = 18
const WINDOWS = 4

export function AuthFrame({ children }: { readonly children: ReactNode }) {
  return (
    <main className="signin-page">
      <div className="signin-skyline" aria-hidden="true">
        {Array.from({ length: BUILDINGS }, (_, building) => (
          <i key={building}>
            {Array.from({ length: WINDOWS }, (_, window) => (
              <span key={window} />
            ))}
          </i>
        ))}
      </div>
      <section className="signin-card">
        <div className="signin-brand">
          <img src="/hostmark-logo-C.svg" alt="" width={44} height={44} />
          <b>
            <span>Host</span>mark
          </b>
        </div>
        {children}
      </section>
    </main>
  )
}
