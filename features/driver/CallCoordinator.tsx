// "Call coordinator" (Figma driver app): a tel: link to the coordination desk set in event
// settings. Renders nothing when the event has no number.
import { Icon } from '@/components/ui/Icon'

interface CallCoordinatorProps {
  readonly phone: string | null
  /** Light outline on white surfaces (trip sheet, quiet day); the default sits on the dark hero. */
  readonly light?: boolean
}

export function CallCoordinator({ phone, light = false }: CallCoordinatorProps) {
  if (!phone) return null
  return (
    <a className={`driver-call ${light ? 'is-light' : ''}`.trim()} href={`tel:${phone}`}>
      <Icon name="phone" />
      Call coordinator
    </a>
  )
}
