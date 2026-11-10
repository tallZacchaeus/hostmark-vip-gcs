// Better Auth admin-plugin permissions. Only Super Admin, Programme Manager and Admin manage accounts, and nobody
// gets impersonation, deletion or email changes. Finer rules (Admin cannot touch Admin or
// Super Admin accounts) are enforced by our own routes and by row-level security.
import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/admin/access'
import type { AppRole } from './roles'

export const accessControl = createAccessControl(defaultStatements)

const accountManager = accessControl.newRole({
  user: ['create', 'list', 'set-role', 'ban', 'set-password', 'get', 'update'],
  session: ['list', 'revoke'],
})

const noAccountAccess = accessControl.newRole({ user: [], session: [] })

export const authRoles: Readonly<Record<AppRole, typeof accountManager | typeof noAccountAccess>> = {
  super_admin: accountManager,
  programme_manager: accountManager,
  admin: accountManager,
  coordinator: noAccountAccess,
  programs: noAccountAccess,
  driver: noAccountAccess,
  accommodation: noAccountAccess,
  housekeeping: noAccountAccess,
}
