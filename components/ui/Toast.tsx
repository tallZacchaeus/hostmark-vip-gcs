'use client'
// One toast at a time, announced politely to screen readers. An optional action (usually
// "Undo") stays available until the toast closes (10 s, 04-UI-UX-Design-Brief.md section 5).
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'

const TOAST_MS = 10_000

export interface ToastOptions {
  readonly message: string
  readonly tone?: 'success' | 'info' | 'error'
  readonly action?: { readonly label: string; readonly run: () => void }
}

interface ToastState extends ToastOptions {
  readonly id: number
}

interface ToastApi {
  show(options: ToastOptions): void
  dismiss(): void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return api
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const dismiss = useCallback(() => setToast(null), [])
  const show = useCallback((options: ToastOptions) => setToast({ ...options, id: Date.now() }), [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(dismiss, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast, dismiss])

  const icon = toast?.tone === 'error' ? 'alert' : toast?.tone === 'info' ? 'info' : 'check'
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" className="toast-region">
        {toast && (
          <div className={`toast-v4 ${toast.tone === 'error' ? 'is-error' : ''}`} key={toast.id}>
            <Icon name={icon} />
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run()
                  dismiss()
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" onClick={dismiss}>
              <Icon name="close" size={17} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
