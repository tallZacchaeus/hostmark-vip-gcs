'use client'
// Cleaning actions with their toasts. Every action refreshes the queue (and the rooms board and
// front desk, which show readiness); conflicts come back as the database's message.
import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { apiSend, errorMessage } from '@/lib/client/api'
import { refreshApi } from '@/lib/client/use-api'
import type { CleaningItem, CleaningProblem } from '@/lib/repositories/cleaning'
import { CLEANING_PATH } from './model'

export function useCleaningActions() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const act = async (path: string, body: unknown, onDone: () => void): Promise<boolean> => {
    setBusy(true)
    try {
      await apiSend(path, 'POST', body)
      onDone()
      return true
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
      return false
    } finally {
      setBusy(false)
      await refreshApi(CLEANING_PATH, '/api/rooms', '/api/front-desk')
    }
  }

  const undo = (item: CleaningItem) =>
    act(`${CLEANING_PATH}/${item.task_id}/undo-complete`, {}, () => toast.show({ message: `Room ${item.room_number} is back in progress.` }))

  return {
    busy,
    start: (item: CleaningItem) => act(`${CLEANING_PATH}/${item.task_id}/start`, {}, () => toast.show({ message: `Started room ${item.room_number}.` })),
    complete: (item: CleaningItem) =>
      act(`${CLEANING_PATH}/${item.task_id}/complete`, {}, () =>
        toast.show({ message: `Room ${item.room_number} is ready.`, action: { label: 'Undo', run: () => void undo(item) } }),
      ),
    report: (item: CleaningItem, kind: CleaningProblem, note: string) =>
      act(`${CLEANING_PATH}/${item.task_id}/report`, { kind, note }, () => toast.show({ message: `Reported. The coordinators have been told about room ${item.room_number}.` })),
    reverse: (item: CleaningItem) =>
      act(`${CLEANING_PATH}/${item.task_id}/reverse-checkout`, {}, () => toast.show({ message: `Check-out reversed. Room ${item.room_number} is occupied again.` })),
  }
}
