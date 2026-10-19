// Console screens (sidebar + top bar). Every page below also checks its own role list.
import type { ReactNode } from 'react'
import { ConsoleShell } from '@/components/shell/ConsoleShell'
import { CONSOLE_ROLES } from '@/lib/auth/page-access'
import { requirePageSession, toSessionValue } from '@/lib/auth/page-guard'

export default async function ConsoleLayout({ children }: { readonly children: ReactNode }) {
  const session = await requirePageSession(CONSOLE_ROLES)
  return <ConsoleShell session={toSessionValue(session)}>{children}</ConsoleShell>
}
