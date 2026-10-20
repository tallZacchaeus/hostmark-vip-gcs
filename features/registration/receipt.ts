'use client'
// The confirmation page shows the receipt the server returned on submit. It is kept in this tab's
// sessionStorage only: nothing can look a registration up by reference (FR-IN-02).
import { useMemo, useSyncExternalStore } from 'react'
import type { ArrivalMode } from '@/lib/domain/intake/schema'

export interface RegistrationReceipt {
  readonly reference_code: string
  readonly follow_up: boolean
  readonly summary: {
    readonly guest: string
    readonly companions: number
    readonly arrival_mode: ArrivalMode | null
    readonly arrival_date: string | null
    readonly flight_number: string | null
  }
}

const keyFor = (token: string): string => `hostmark.registration.${token}`

export function saveReceipt(token: string, receipt: RegistrationReceipt): void {
  try {
    window.sessionStorage.setItem(keyFor(token), JSON.stringify(receipt))
  } catch {
    // Private browsing can refuse storage; the confirmation page then shows a generic message.
  }
}

function readRaw(token: string): string | null {
  try {
    return window.sessionStorage.getItem(keyFor(token))
  } catch {
    return null
  }
}

const noSubscription = () => () => undefined

export function useReceipt(token: string): RegistrationReceipt | null {
  const raw = useSyncExternalStore(noSubscription, () => readRaw(token), () => null)
  return useMemo(() => {
    if (!raw) return null
    try {
      return JSON.parse(raw) as RegistrationReceipt
    } catch {
      return null
    }
  }, [raw])
}
