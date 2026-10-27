// Labels shared by the coordinator's Sanitation screen and the housekeeping phone.
import type { IconName } from '@/components/ui/Icon'
import type { CleaningItem, CleaningProblem } from '@/lib/repositories/cleaning'

export const CLEANING_PATH = '/api/cleaning'

export const PROBLEMS: readonly { readonly kind: CleaningProblem; readonly label: string; readonly icon: IconName }[] = [
  { kind: 'maintenance', label: 'Maintenance needed', icon: 'wrench' },
  { kind: 'supplies', label: 'Missing supplies', icon: 'packageX' },
  { kind: 'other', label: 'Other', icon: 'message' },
]

export const problemLabel = (kind: CleaningProblem): string => PROBLEMS.find((item) => item.kind === kind)?.label ?? 'Problem reported'

export function statusLabel(item: Pick<CleaningItem, 'status'>): string {
  if (item.status === 'done') return 'Done'
  return item.status === 'in_progress' ? 'In progress' : 'Needs cleaning'
}

/** "Ready 15 min after it is needed" (Figma), or null when on time. */
export function lateText(item: Pick<CleaningItem, 'late_by_min'>): string | null {
  return item.late_by_min > 0 ? `Ready ${item.late_by_min} min after it is needed` : null
}
