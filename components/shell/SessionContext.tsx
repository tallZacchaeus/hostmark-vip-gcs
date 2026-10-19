'use client'
// The signed-in staff member and the event, read once on the server by the layout's page guard
// and shared with every client component below it.
import { createContext, type ReactNode, useContext } from 'react'
import type { AppRole } from '@/lib/auth/roles'

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

export interface SessionValue {
  readonly user: SessionUser
  readonly event: SessionEvent | null
  readonly homeRoute: string
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ value, children }: { readonly value: SessionValue; readonly children: ReactNode }) {
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
