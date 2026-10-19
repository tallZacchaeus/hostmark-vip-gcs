'use client'
// Settings: staff accounts and the reference data the system uses. Tabs follow the role
// (coordinators see VIP categories only); the active tab lives in the URL (?tab=).
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/components/shell/SessionContext'
import { type SettingsTab, settingsTabsFor } from '@/lib/auth/page-access'
import { CategoriesTab } from './CategoriesTab'
import { DriversTab } from './DriversTab'
import { RoomsTab } from './RoomsTab'
import { SystemTab } from './SystemTab'
import { UsersTab } from './UsersTab'

const TAB_LABELS: Readonly<Record<SettingsTab, string>> = {
  users: 'Users',
  rooms: 'Rooms',
  drivers: 'Drivers',
  categories: 'VIP categories',
  system: 'System',
}

const TAB_PANELS: Readonly<Record<SettingsTab, () => React.ReactNode>> = {
  users: () => <UsersTab />,
  rooms: () => <RoomsTab />,
  drivers: () => <DriversTab />,
  categories: () => <CategoriesTab />,
  system: () => <SystemTab />,
}

export function SettingsScreen() {
  const { user } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabs = settingsTabsFor(user.role)
  const requested = searchParams.get('tab') as SettingsTab | null
  const active = requested && tabs.includes(requested) ? requested : tabs[0]

  const select = (tab: SettingsTab) => router.replace(`${pathname}?tab=${tab}`, { scroll: false })

  return (
    <main className="settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <p>Staff accounts and the reference data the system uses.</p>
      </header>
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`settings-tab-${tab}`}
            aria-selected={tab === active}
            aria-controls="settings-panel"
            className={tab === active ? 'is-active' : ''}
            onClick={() => select(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={active ? `settings-tab-${active}` : undefined} className="settings-panel">
        {active ? TAB_PANELS[active]() : null}
      </div>
    </main>
  )
}
