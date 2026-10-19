-- migrate:up
-- Foundation: runtime roles, schemas, extensions, enums and shared helpers.
--
-- Access model (see docs/05-Backend-Schema.md section 6):
--   vip_app     LOGIN role used by the API. Row-level security applies. Each request runs in a
--               transaction that sets app.user_id, which policies read via private.current_user_id().
--   vip_system  NOLOGIN role for trusted server work (auth library, jobs, intake pipeline).
--               vip_app switches to it with SET ROLE. Every table gives it an explicit
--               "system_all" policy, so no superuser-only BYPASSRLS attribute is needed.
-- LOGIN and passwords are configured outside migrations (db/docker-init, deploy scripts).

--   vip_service LOGIN role for trusted server processes only (Better Auth's pool, scripts and,
--               from P3, the worker). It is the only member of vip_system, so the API's own
--               credential (vip_app) can never switch to vip_system.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vip_app') then
    create role vip_app nologin noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vip_system') then
    create role vip_system nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vip_service') then
    create role vip_service nologin noinherit;
  end if;
end
$$;

grant vip_system to vip_service;

revoke create on schema public from public;
grant usage on schema public to vip_app, vip_system;

-- Internal helpers that are never called directly by the API.
create schema private;
revoke all on schema private from public;
grant usage on schema private to vip_app, vip_system;

create extension if not exists btree_gist;

-- Functions are executable by PUBLIC by default in Postgres. Deny by default; every
-- function that a runtime role may call gets an explicit GRANT. This must be the global
-- form: a per-schema (IN SCHEMA) rule can only add privileges, never remove PUBLIC's.
alter default privileges revoke execute on functions from public;

create type public.app_role as enum (
  'super_admin', 'admin', 'coordinator', 'programs', 'driver', 'accommodation', 'housekeeping'
);
create type public.actor_type as enum ('user', 'system', 'copilot', 'guest_intake');
create type public.housekeeping_status as enum ('clean', 'needs_cleaning', 'cleaning');
create type public.proposal_kind as enum (
  'room_plan', 'room_assignment', 'driver_assignment', 'driver_reassignment',
  'release_pickup', 'copilot_action'
);
create type public.proposal_status as enum (
  'pending', 'approved', 'rejected', 'superseded', 'expired', 'failed'
);

-- The signed-in staff member for the current transaction (null for anonymous/system work).
create function private.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

create function private.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
$$;

-- 122 bits of randomness, URL-safe (hex). Used for the shared intake link.
create function private.new_intake_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
$$;

-- Enables RLS on a table and gives vip_system full access through an explicit policy.
-- Called from migrations only (never granted to runtime roles).
create function private.enable_rls(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute pg_catalog.format('alter table %s enable row level security', p_table);
  execute pg_catalog.format('grant select, insert, update, delete on %s to vip_system', p_table);
  execute pg_catalog.format(
    'create policy system_all on %s as permissive for all to vip_system using (true) with check (true)',
    p_table
  );
end
$$;
revoke all on function private.enable_rls(regclass) from public;

grant execute on function private.current_user_id() to vip_app, vip_system;
grant execute on function private.is_valid_timezone(text) to vip_app, vip_system;
-- vip_app needs it because it is the column default for events.intake_token.
grant execute on function private.new_intake_token() to vip_app, vip_system;

-- migrate:down
alter default privileges grant execute on functions to public;
drop function if exists private.enable_rls(regclass);
drop function if exists private.new_intake_token();
drop function if exists private.is_valid_timezone(text);
drop function if exists private.set_updated_at();
drop function if exists private.current_user_id();
drop type if exists public.proposal_status;
drop type if exists public.proposal_kind;
drop type if exists public.housekeeping_status;
drop type if exists public.actor_type;
drop type if exists public.app_role;
drop schema if exists private;
