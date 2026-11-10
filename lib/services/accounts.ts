// Staff account management (FR-PL-01). Better Auth owns passwords and sessions; our rules
// (who may manage whom) are checked here and again by row-level security. Better Auth runs first
// and outside our transaction, then the profile changes and audit entry happen as the admin.
import 'server-only'
import { type Kysely, type Selectable, sql } from 'kysely'
import { ApiError, Errors } from '@/lib/api/errors'
import { getAuth } from '@/lib/auth/auth'
import { revokePasswordLinks } from '@/lib/auth/password-links'
import { type AppRole, canManageAccount } from '@/lib/auth/roles'
import type { Actor } from '@/lib/auth/session'
import { type Tx, withUser } from '@/lib/db/context'
import type { DB, Profiles } from '@/lib/db/types'
import { generateTemporaryPassword } from '@/lib/domain/temporary-password'
import { logger } from '@/lib/logger'
import { deliverPassword } from '@/lib/services/password-delivery'
import type { AccountCreate, AccountListQuery, AccountUpdate } from '@/lib/validation/accounts'

const ACCOUNT_COLUMNS = [
  'id',
  'full_name',
  'email',
  'role',
  'phone',
  'banned',
  'ban_reason',
  'must_change_password',
  'created_at',
  'updated_at',
] as const

type AccountRow = Pick<Selectable<Profiles>, (typeof ACCOUNT_COLUMNS)[number]>

export interface AccountView {
  readonly id: string
  readonly full_name: string
  readonly email: string
  readonly role: AppRole
  readonly phone: string | null
  readonly active: boolean
  readonly deactivation_reason: string | null
  readonly must_change_password: boolean
  readonly created_at: Date
  readonly updated_at: Date
}

function toView(row: AccountRow): AccountView {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    active: !row.banned,
    deactivation_reason: row.ban_reason,
    must_change_password: row.must_change_password,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function findAccount(tx: Tx, id: string): Promise<AccountRow | undefined> {
  return tx.selectFrom('profiles').select(ACCOUNT_COLUMNS).where('id', '=', id).executeTakeFirst()
}

function isDuplicateEmail(error: unknown): boolean {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code
  return typeof code === 'string' && code.includes('ALREADY_EXISTS')
}

async function requireVisible(db: Kysely<DB>, actor: Actor, id: string): Promise<AccountRow> {
  const target = await withUser(db, actor.id, (tx) => findAccount(tx, id))
  if (!target) {
    throw Errors.notFound('Account')
  }
  return target
}

function assertCanManage(actor: Actor, target: AccountRow): void {
  if (!canManageAccount(actor.role, target.role)) {
    throw Errors.forbidden('You cannot manage this account')
  }
}

/**
 * The database's rule on top of the role rule (P9): a manager changes only accounts that work on
 * no event outside the ones they work on. Checked before anything happens, because a password
 * reset goes through the auth library before the database sees it.
 */
async function assertManageable(db: Kysely<DB>, actor: Actor, id: string): Promise<void> {
  await withUser(db, actor.id, (tx) => sql`select public.assert_may_manage_account(${id}::uuid)`.execute(tx))
}

export async function getAccount(db: Kysely<DB>, actor: Actor, id: string): Promise<AccountView> {
  const row = await withUser(db, actor.id, (tx) => findAccount(tx, id))
  if (!row) {
    throw Errors.notFound('Account')
  }
  return toView(row)
}

export async function listAccounts(db: Kysely<DB>, actor: Actor, query: AccountListQuery) {
  return withUser(db, actor.id, async (tx) => {
    let base = tx.selectFrom('profiles')
    if (query.role) base = base.where('role', '=', query.role)
    if (query.active !== undefined) base = base.where('banned', '=', !query.active)
    if (query.search) {
      const pattern = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
      base = base.where((eb) => eb.or([eb('full_name', 'ilike', pattern), eb('email', 'ilike', pattern)]))
    }
    const { total } = await base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow()
    const rows = await base
      .select(ACCOUNT_COLUMNS)
      .orderBy('full_name')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .execute()
    return { rows: rows.map(toView), total: Number(total) }
  })
}

export async function createAccount(db: Kysely<DB>, actor: Actor, input: AccountCreate, headers: Headers) {
  if (!canManageAccount(actor.role, input.role)) {
    throw Errors.forbidden('You cannot create accounts with this role')
  }
  const temporaryPassword = generateTemporaryPassword()

  let userId: string
  try {
    const created = await getAuth().api.createUser({
      headers,
      body: { email: input.email, password: temporaryPassword, name: input.full_name, role: input.role },
    })
    userId = created.user.id
  } catch (error: unknown) {
    if (isDuplicateEmail(error)) {
      throw new ApiError(409, 'already_exists', 'An account with this email already exists')
    }
    throw error
  }

  let account: AccountRow | undefined
  try {
    account = await withUser(db, actor.id, async (tx) => {
      // New staff work on the inviter's current event (P9); Super Admins see every event anyway.
      if (input.role !== 'super_admin') {
        await sql`insert into public.event_members (event_id, profile_id, added_by)
          select private.current_event_id(), ${userId}::uuid, ${actor.id}::uuid
          where private.current_event_id() is not null
          on conflict do nothing`.execute(tx)
      }
      await sql`select private.audit_profile_change(${userId}::uuid, 'profiles.create')`.execute(tx)
      if (input.phone) {
        await tx.updateTable('profiles').set({ phone: input.phone }).where('id', '=', userId).execute()
      }
      return findAccount(tx, userId)
    })
  } catch (error: unknown) {
    logger.error('Account created but its setup failed', { userId, error })
  }
  if (!account) {
    // The login exists but its temporary password is lost; a password reset recovers it.
    throw new ApiError(
      500,
      'account_setup_incomplete',
      'The account was created but setup did not finish. Use "Reset password" on it to issue a new temporary password.',
      { account_id: userId },
    )
  }
  const view = toView(account)
  return { account: view, ...(await deliverPassword('invite', view, temporaryPassword)) }
}

export async function updateAccount(db: Kysely<DB>, actor: Actor, id: string, input: AccountUpdate, headers: Headers) {
  const target = await requireVisible(db, actor, id)
  // Checked first so locking yourself out gets the specific explanation.
  const changesOwnAccess = (input.role !== undefined && input.role !== target.role) || input.active === false
  if (id === actor.id && changesOwnAccess) {
    throw new ApiError(409, 'cannot_change_own_access', 'You cannot change your own role or deactivate your own account')
  }
  assertCanManage(actor, target)
  await assertManageable(db, actor, id)
  if (input.role && !canManageAccount(actor.role, input.role)) {
    throw Errors.forbidden('You cannot assign this role')
  }

  const deactivating = input.active === false
  const updated = await withUser(db, actor.id, (tx) =>
    tx
      .updateTable('profiles')
      .set({
        full_name: input.full_name,
        phone: input.phone,
        role: input.role,
        banned: input.active === undefined ? undefined : !input.active,
        ban_reason: deactivating ? (input.deactivation_reason ?? null) : input.active === true ? null : undefined,
      })
      .where('id', '=', id)
      .returning(ACCOUNT_COLUMNS)
      .executeTakeFirst(),
  )
  if (!updated) {
    throw Errors.notFound('Account')
  }
  if (deactivating) {
    await getAuth().api.revokeUserSessions({ headers, body: { userId: id } })
    await revokePasswordLinks(id)
  }
  return toView(updated)
}

export async function resetAccountPassword(db: Kysely<DB>, actor: Actor, id: string, headers: Headers) {
  if (id === actor.id) {
    throw new ApiError(409, 'use_password_change', 'Change your own password from your account settings')
  }
  const target = await requireVisible(db, actor, id)
  assertCanManage(actor, target)
  await assertManageable(db, actor, id)
  const temporaryPassword = generateTemporaryPassword()

  await getAuth().api.setUserPassword({ headers, body: { userId: id, newPassword: temporaryPassword } })
  await getAuth().api.revokeUserSessions({ headers, body: { userId: id } })
  await withUser(db, actor.id, async (tx) => {
    await tx.updateTable('profiles').set({ must_change_password: true }).where('id', '=', id).execute()
    await sql`select private.audit_profile_change(${id}::uuid, 'profiles.password_reset')`.execute(tx)
  })
  return deliverPassword('admin_reset', toView(target), temporaryPassword)
}

export async function changeOwnPassword(
  db: Kysely<DB>,
  actor: Actor,
  passwords: { readonly current: string; readonly next: string },
  headers: Headers,
): Promise<{ readonly token: string | null; readonly responseHeaders: Headers }> {
  const { headers: responseHeaders, response } = await getAuth().api.changePassword({
    headers,
    returnHeaders: true,
    body: { currentPassword: passwords.current, newPassword: passwords.next, revokeOtherSessions: true },
  })
  await withUser(db, actor.id, (tx) => sql`select public.complete_password_change()`.execute(tx))
  return { token: response.token ?? null, responseHeaders }
}
