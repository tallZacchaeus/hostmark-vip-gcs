'use client'
// Modal dialogs, drawers and bottom sheets share one behaviour: Escape and the scrim close them,
// focus moves inside on open and returns to where it was on close, Tab stays inside, and the
// page behind does not scroll. Class names come from the design so each keeps its own look.
import { type ReactNode, useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  readonly children: ReactNode
  readonly onClose: () => void
  /** The full-screen layer, e.g. "settings-dialog-scrim". */
  readonly scrimClassName: string
  /** The panel, e.g. "settings-dialog settings-dialog--wide". */
  readonly className: string
  readonly as?: 'section' | 'aside'
  readonly role?: 'dialog' | 'alertdialog'
  readonly labelledBy?: string
  readonly label?: string
}

function useFocusTrap(panel: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = panel.current
    const first = element?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? element?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? element)?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !element) return
      const items = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE))
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (!firstItem || !lastItem) return
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [panel])
}

export function Modal({ children, onClose, scrimClassName, className, as = 'section', role = 'dialog', labelledBy, label }: ModalProps) {
  const panel = useRef<HTMLElement>(null)
  useFocusTrap(panel, onClose)
  const Panel = as

  return (
    <div className={scrimClassName} onClick={onClose}>
      <Panel
        ref={panel as React.RefObject<HTMLElement & HTMLDivElement>}
        className={className}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </Panel>
    </div>
  )
}
