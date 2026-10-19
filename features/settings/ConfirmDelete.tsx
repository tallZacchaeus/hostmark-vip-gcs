'use client'
import { FormDialog } from '@/components/ui/FormDialog'
import { apiSend } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'

interface ConfirmDeleteProps {
  readonly label: string
  readonly path: string
  readonly onClose: () => void
  readonly onDeleted: () => void
}

/** "Delete X?" confirmation that calls DELETE on `path`. Records still in use are refused by the API. */
export function ConfirmDelete({ label, path, onClose, onDeleted }: ConfirmDeleteProps) {
  const action = useAction()
  return (
    <FormDialog
      title={`Delete ${label}?`}
      description="Records that are still in use cannot be deleted. Deletions are kept in Activity."
      submitLabel="Delete"
      width="compact"
      danger
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      onSubmit={() =>
        void action.run(async () => {
          await apiSend(path, 'DELETE')
          onDeleted()
        })
      }
    />
  )
}
