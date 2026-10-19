'use client'
import { useRouter } from 'next/navigation'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { apiSend, errorMessage } from '@/lib/client/api'
import { formatTime } from '@/lib/client/format'
import { entityHref } from '@/lib/client/labels'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { useSession, useTimeZone } from './SessionContext'

export const NOTIFICATIONS_PATH = '/api/notifications?limit=30'

export interface NotificationItem {
  readonly id: string
  readonly kind: string
  readonly priority: 'normal' | 'high'
  readonly title: string
  readonly body: string | null
  readonly entity_type: string | null
  readonly entity_id: string | null
  readonly created_at: string
  readonly read_at: string | null
}

export interface NotificationList {
  readonly items: NotificationItem[]
  readonly unread_count: number
}

type Tone = 'amber' | 'lilac' | 'red' | 'blue' | 'green'

/** Icon and colour by what the notification is about. */
export function notificationLook(item: Pick<NotificationItem, 'kind' | 'entity_type' | 'priority'>): { icon: IconName; tone: Tone } {
  const subject = `${item.kind} ${item.entity_type ?? ''}`
  if (subject.includes('program')) return { icon: 'calendarClock', tone: 'red' }
  if (subject.includes('proposal')) return { icon: 'sparkle', tone: 'lilac' }
  if (subject.includes('intake') || subject.includes('submission')) return { icon: 'inbox', tone: 'green' }
  if (subject.includes('flight') || subject.includes('arrival')) return { icon: 'plane', tone: 'amber' }
  if (subject.includes('clean')) return { icon: 'spray', tone: 'blue' }
  if (subject.includes('pickup') || subject.includes('trip')) return { icon: 'car', tone: 'amber' }
  return { icon: item.priority === 'high' ? 'alert' : 'bell', tone: item.priority === 'high' ? 'red' : 'blue' }
}

export function NotificationsDrawer({ onClose }: { readonly onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const { user } = useSession()
  const timeZone = useTimeZone()
  const { data, error, isLoading, mutate } = useApi<NotificationList>(NOTIFICATIONS_PATH)
  const unread = data?.unread_count ?? 0

  const markRead = async (ids?: string[]) => {
    try {
      await apiSend('/api/notifications/read', 'POST', ids ? { ids } : {})
      await refreshApi('/api/notifications')
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    }
  }

  const open = (item: NotificationItem) => {
    if (!item.read_at) void markRead([item.id])
    const href = entityHref(user.role, item.entity_type, item.entity_id)
    onClose()
    if (href) router.push(href)
  }

  const countText = isLoading ? 'Loading…' : unread ? `${unread} unread` : 'All caught up'

  return (
    <Modal onClose={onClose} scrimClassName="notifications-scrim" className="notifications-drawer" as="aside" labelledBy="notifications-title">
      <header>
        <div>
          <h2 id="notifications-title">Notifications</h2>
          <button type="button" aria-label="Close notifications" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <span>
          <b>{countText}</b>
          {unread > 0 && (
            <button type="button" onClick={() => void markRead()}>
              Mark all as read
            </button>
          )}
        </span>
      </header>
      <div className="notifications-list">
        {error ? <ErrorBanner className="notifications-error" message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
        {isLoading ? (
          <div className="notifications-loading">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="notifications-empty">
            <span>
              <Icon name="check" size={30} />
            </span>
            <b>Nothing needs your attention.</b>
          </div>
        ) : (
          data?.items.map((item) => {
            const look = notificationLook(item)
            const read = item.read_at !== null
            return (
              <button type="button" className={`notification-row ${read ? 'is-read' : 'is-unread'}`} key={item.id} onClick={() => open(item)}>
                {!read && <i className="notification-dot" aria-label="Unread" />}
                <span className={`notification-icon notification-icon--${look.tone}`}>
                  <Icon name={look.icon} size={21} />
                </span>
                <span className="notification-copy">
                  <b>{item.title}</b>
                  {item.body && <small>{item.body}</small>}
                </span>
                <time dateTime={item.created_at}>{formatTime(item.created_at, timeZone)}</time>
                <Icon name="arrow" size={16} />
              </button>
            )
          })
        )}
      </div>
    </Modal>
  )
}
