'use client'
// VIP categories (FR-PL-06): an ordered rank list (1 = highest) that coordinators maintain. The
// allocator matches each category's preferred room tier.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Field, FormDialog, unmet } from '@/components/ui/FormDialog'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { apiSend, errorMessage } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { ConfirmDelete } from './ConfirmDelete'
import type { VipCategory } from './types'

const PATH = '/api/admin/vip-categories?limit=200'

function CategoryDialog({ category, nextRank, onClose, onSaved }: { readonly category: VipCategory | null; readonly nextRank: number; readonly onClose: () => void; readonly onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [tier, setTier] = useState(category?.preferred_room_tier ? String(category.preferred_room_tier) : '')
  const action = useAction()
  const submit = () =>
    void action.run(async () => {
      const body = { name: name.trim(), preferred_room_tier: tier ? Number.parseInt(tier, 10) : null }
      await (category
        ? apiSend(`/api/admin/vip-categories/${category.id}`, 'PATCH', body)
        : apiSend('/api/admin/vip-categories', 'POST', { ...body, rank: nextRank }))
      onSaved()
    })
  return (
    <FormDialog
      title={category ? 'Edit VIP category' : 'Add VIP category'}
      submitLabel={category ? 'Save' : 'Add category'}
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={unmet([[name.trim() !== '', 'Enter a name']])}
    >
      <Field label="Name" required hint="e.g. Head of State / Minister">
        <input value={name} onChange={(event) => setName(event.target.value)} data-autofocus />
      </Field>
      <Field label="Preferred room tier" hint="Tier 1 is the best rooms. Leave empty for no preference.">
        <input type="number" min={1} max={99} value={tier} onChange={(event) => setTier(event.target.value)} />
      </Field>
    </FormDialog>
  )
}

export function CategoriesTab() {
  const toast = useToast()
  const categories = useApi<VipCategory[]>(PATH)
  const [dialog, setDialog] = useState<{ type: 'edit'; category: VipCategory | null } | { type: 'delete'; category: VipCategory } | null>(null)
  const reorder = useAction()
  const list = [...(categories.data ?? [])].sort((a, b) => a.rank - b.rank)
  const close = () => setDialog(null)
  const saved = (message: string) => {
    close()
    toast.show({ message })
    void refreshApi('/api/admin/vip-categories')
  }

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= list.length) return
    const ids = list.map((category) => category.id)
    const [moved] = ids.splice(index, 1)
    if (!moved) return
    ids.splice(target, 0, moved)
    void reorder.run(async () => {
      await apiSend('/api/admin/vip-categories/reorder', 'POST', { ids })
      await refreshApi('/api/admin/vip-categories')
    })
  }

  return (
    <div className="settings-section">
      <section className="data-card" aria-labelledby="categories-title">
        <header>
          <div>
            <h2 id="categories-title">VIP categories</h2>
            <p>Highest rank first. Guests get their category from a coordinator, never from the registration form.</p>
          </div>
          <div>
            <Button kind="primary" icon="plus" onClick={() => setDialog({ type: 'edit', category: null })}>
              Add category
            </Button>
          </div>
        </header>
        {categories.error ? <ErrorBanner className="settings-error" message={errorMessage(categories.error)} onRetry={() => void categories.mutate()} /> : null}
        {reorder.error && <ErrorBanner className="settings-error" message={reorder.error} />}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="num">Rank</th>
                <th>Name</th>
                <th>Preferred room tier</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((category, index) => (
                <tr key={category.id}>
                  <td className="num">{category.rank}</td>
                  <td>{category.name}</td>
                  <td>{category.preferred_room_tier ? `Tier ${category.preferred_room_tier}` : 'No preference'}</td>
                  <td>
                    <div className="row-actions">
                      <span className="order-buttons">
                        <button type="button" className="icon-button rotate-180" aria-label={`Move ${category.name} up`} disabled={index === 0 || reorder.busy} onClick={() => move(index, -1)}>
                          <Icon name="chevron" size={16} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Move ${category.name} down`} disabled={index === list.length - 1 || reorder.busy} onClick={() => move(index, 1)}>
                          <Icon name="chevron" size={16} />
                        </button>
                      </span>
                      <button type="button" className="icon-button" aria-label={`Edit ${category.name}`} onClick={() => setDialog({ type: 'edit', category })}>
                        <Icon name="edit" size={17} />
                      </button>
                      <button type="button" className="icon-button is-danger" aria-label={`Delete ${category.name}`} onClick={() => setDialog({ type: 'delete', category })}>
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.isLoading && <Skeleton className="sk-wide" />}
        </div>
      </section>
      {dialog?.type === 'edit' && (
        <CategoryDialog
          category={dialog.category}
          nextRank={(list.at(-1)?.rank ?? 0) + 1}
          onClose={close}
          onSaved={() => saved('VIP category saved.')}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDelete
          label={`VIP category ${dialog.category.name}`}
          path={`/api/admin/vip-categories/${dialog.category.id}`}
          onClose={close}
          onDeleted={() => saved('VIP category deleted.')}
        />
      )}
    </div>
  )
}
