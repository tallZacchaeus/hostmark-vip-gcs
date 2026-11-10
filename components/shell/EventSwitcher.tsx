'use client'
// The event this screen works in (P9), in the top bar. Someone on several events picks another
// here: the choice is saved on their profile, then the home screen opens afresh in that event
// (a full load, so no screen keeps showing data of the previous event).
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { apiSend } from '@/lib/client/api'
import { navigateTo } from '@/lib/client/navigate'
import { useAction } from '@/lib/client/use-action'
import { type SessionEventOption, useSession } from './SessionContext'

const STATUS_LABELS: Readonly<Record<SessionEventOption['status'], string>> = {
  draft: 'Draft',
  live: 'Live',
  archived: 'Archived · read-only',
}

function StatusTag({ status }: { readonly status: SessionEventOption['status'] }) {
  return <small className={`event-status is-${status}`}>{STATUS_LABELS[status]}</small>
}

export function EventSwitcher() {
  const { event, events, homeRoute } = useSession()
  const [open, setOpen] = useState(false)
  const action = useAction()
  const current = events.find((option) => option.is_current)
  const name = current?.name ?? event?.name

  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(false)
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') close()
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!name) return null
  const label = (
    <>
      <Icon name="calendar" size={17} />
      <span>{name}</span>
      {current && current.status !== 'live' && <StatusTag status={current.status} />}
    </>
  )
  if (events.length < 2) {
    return (
      <span className="event-switcher" title={name}>
        {label}
      </span>
    )
  }

  const choose = (option: SessionEventOption) => {
    if (option.is_current) {
      setOpen(false)
      return
    }
    void action.run(async () => {
      await apiSend('/api/me/event', 'PUT', { event_id: option.id })
      navigateTo(homeRoute)
    })
  }

  return (
    <div className="event-switcher-menu" onClick={(clickEvent) => clickEvent.stopPropagation()}>
      <button
        type="button"
        className="event-switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch event, now ${name}`}
        title={name}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div role="menu" aria-label="Your events">
          {events.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.is_current}
              disabled={action.busy}
              onClick={() => choose(option)}
            >
              <span>{option.name}</span>
              <StatusTag status={option.status} />
              {option.is_current && <Icon name="check" size={16} />}
            </button>
          ))}
          {action.error && (
            <p className="form-error" role="alert">
              {action.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
