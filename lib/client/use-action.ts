'use client'
// Busy and error state for one mutation at a time (save, delete, approve…).
import { useCallback, useState } from 'react'
import { errorMessage } from './api'

export interface ActionState {
  readonly busy: boolean
  readonly error: string | null
  /** Runs `work`; resolves to true on success, false (with `error` set) on failure. */
  run(work: () => Promise<unknown>): Promise<boolean>
  clearError(): void
}

export function useAction(): ActionState {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      return true
    } catch (caught: unknown) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  return { busy, error, run, clearError }
}
