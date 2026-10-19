import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

// Guards that apply to every table and function, so new migrations cannot silently skip them.
describe('database security baseline', () => {
  const db = useTestDb()

  it('enables row-level security on every table in the public schema', async () => {
    const tables = await db().rows<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        and c.relname <> 'schema_migrations'`)
    expect(tables).toEqual([])
  })

  it('gives vip_system an explicit policy on every table', async () => {
    const tables = await db().rows<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'
        and not exists (
          select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'system_all'
        )`)
    expect(tables).toEqual([])
  })

  it('gives vip_app no access to the auth library tables', async () => {
    const grants = await db().rows(`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'vip_app' and table_name like 'auth\\_%'`)
    expect(grants).toEqual([])
  })

  it('keeps the audit log append-only for every runtime role', async () => {
    const privileges = await db().one<Record<string, boolean>>(`
      select
        has_table_privilege('vip_app', 'public.audit_log', 'update') as app_update,
        has_table_privilege('vip_app', 'public.audit_log', 'delete') as app_delete,
        has_table_privilege('vip_app', 'public.audit_log', 'insert') as app_insert,
        has_table_privilege('vip_system', 'public.audit_log', 'update') as system_update,
        has_table_privilege('vip_system', 'public.audit_log', 'delete') as system_delete`)
    expect(Object.values(privileges).every((allowed) => allowed === false)).toBe(true)
  })

  it('does not let PUBLIC execute any project function', async () => {
    const functions = await db().rows<{ name: string }>(`
      select n.nspname || '.' || p.proname as name from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and has_function_privilege('public', p.oid, 'execute')
        and not exists (
          select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
        )`)
    expect(functions).toEqual([])
  })

  it('keeps the API role from switching to vip_system or forging audit context', async () => {
    const access = await db().one<Record<string, boolean>>(`
      select
        pg_has_role('vip_app', 'vip_system', 'member') as app_is_system,
        pg_has_role('vip_service', 'vip_system', 'member') as service_is_system,
        has_function_privilege('vip_app', 'private.set_audit_context(public.actor_type, text, text, uuid, boolean, boolean, bigint)', 'execute') as app_sets_context`)
    expect(access).toEqual({ app_is_system: false, service_is_system: true, app_sets_context: false })
  })

  it('pins search_path on every SECURITY DEFINER function', async () => {
    const functions = await db().rows<{ name: string }>(`
      select n.nspname || '.' || p.proname as name from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not coalesce(p.proconfig @> array['search_path=""'], false)`)
    expect(functions).toEqual([])
  })
})
