'use client'
import { useCallback, useMemo, useSyncExternalStore } from 'react'

const DEFAULT_TICK_MS = 10_000

/**
 * The current time, refreshed every `tickMs`. Null during server rendering and hydration, so the
 * server and the first client render produce the same markup (no mismatch on clocks).
 */
export function useNow(tickMs: number = DEFAULT_TICK_MS): Date | null {
  const subscribe = useCallback(
    (onTick: () => void) => {
      const timer = window.setInterval(onTick, tickMs)
      return () => window.clearInterval(timer)
    },
    [tickMs],
  )
  // A stable value between ticks, as useSyncExternalStore requires.
  const getSnapshot = useCallback(() => Math.floor(Date.now() / tickMs) * tickMs, [tickMs])
  const value = useSyncExternalStore(subscribe, getSnapshot, () => null)
  return useMemo(() => (value === null ? null : new Date(value)), [value])
}
