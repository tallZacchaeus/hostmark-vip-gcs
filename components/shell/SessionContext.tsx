'use client'
// The signed-in staff member and the event, read once on the server by the layout's page guard
// and shared with every client component below it.
import { createContext, type ReactNode, useContext } from 'react'
import type { AppRole } from '@/lib/auth/roles'
import { setScreenEvent } from '@/lib/client/api'

export interface SessionUser {
  readonly id: string
  readonly fullName: string
  readonly email: string
  readonly role: AppRole
}

export interface SessionEvent {
  readonly id: string
  readonly name: string
  readonly venue_name: string
  readonly timezone: string
  readonly starts_on: string
  readonly ends_on: string
  readonly flight_mode: 'live' | 'simulated'
}

/** An event this person works on, for the top-bar event switcher (P9). */
export interface SessionEventOption {
  readonly id: string
  readonly name: string
  readonly status: 'draft' | 'live' | 'archived'
  readonly is_current: boolean
}

export interface SessionValue {
  readonly user: SessionUser
  readonly event: SessionEvent | null
  /** Every event this person works on; one has is_current (the one shown). */
  readonly events: readonly SessionEventOption[]
  readonly homeRoute: string
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ value, children }: { readonly value: SessionValue; readonly children: ReactNode }) {
  // Set while rendering (not in an effect): children's effects run first and already fetch.
  setScreenEvent(value.event?.id ?? null)
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>')
  }
  return value
}

/** The event's time zone, falling back to UTC before the event is set up. */
export function useTimeZone(): string {
  return useSession().event?.timezone ?? 'UTC'
}
