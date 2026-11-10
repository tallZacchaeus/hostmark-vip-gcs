-- migrate:up
-- P9 step 9.1 (06-Implementation-Plan.md): several events per installation.
--   * events get a status (draft → live → archived) and an owner (a Programme Manager); an owner
--     has at most one live event, while other owners run theirs at the same time.
--   * event_members says which staff work on which event; profiles.active_event_id remembers the
--     event a person last chose.
--   * private.current_event_id() returns the event chosen for this request (app.event_id, set per
--     transaction like app.user_id). Until step 9.3 sets it, it falls back to the live event (or
--     the only one), so the single-event app keeps working unchanged.
-- Isolation between events (an event filter in every policy) is step 9.2: until then this branch
-- must not run more than one event in production.

drop index public.events_singleton;

alter table public.events
  add column status text not null default 'draft' check (status in ('draft', 'live', 'archived')),
  add column owner_id uuid references public.profiles (id) on delete set null;

-- The event already running becomes live, owned by the longest-standing active Super Admin.
update public.events
set status = 'live',
    owner_id = (
      select p.id from public.profiles p
      where p.role = 'super_admin' and not p.banned
      order by p.created_at, p.id
      limit 1
    );

-- Whoever creates an event owns it unless an owner is given (the API cannot name one: owner_id
-- is not in vip_app's insert grant, and column grants only cover the columns a statement names).
create function private.set_event_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is null then
    new.owner_id := private.current_user_id();
  end if;
  return new;
end
$$;
create trigger set_event_owner before insert on public.events
  for each row execute function private.set_event_owner();

create unique index events_one_live_per_owner on public.events (owner_id)
  where status = 'live' and owner_id is not null;
create index events_owner_idx on public.events (owner_id);

-- Staff on each event --------------------------------------------------------------------

create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_members_once unique (event_id, profile_id)
);
create index event_members_profile_idx on public.event_members (profile_id);

select private.enable_rls('public.event_members');
select private.attach_audit('public.event_members');

-- Everyone sees their own memberships; coordinators and above see the event's team.
-- Admins and above add and remove members (step 9.4 narrows this to their own events).
grant select, insert, delete on public.event_members to vip_app;
create policy event_members_select on public.event_members for select to vip_app
  using (profile_id = (select private.current_user_id()) or (select private.is_coordinator_plus()));
create policy event_members_insert on public.event_members for insert to vip_app
  with check ((select private.is_admin_plus()));
create policy event_members_delete on public.event_members for delete to vip_app
  using ((select private.is_admin_plus()));

-- Existing staff keep working on the existing event (Super Admins see every event anyway).
insert into public.event_members (event_id, profile_id)
select e.id, p.id
from public.events e
cross join public.profiles p
where p.role <> 'super_admin';

alter table public.profiles
  add column active_event_id uuid references public.events (id) on delete set null;

-- The request's event --------------------------------------------------------------------

create or replace function private.current_event_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.current_setting('app.event_id', true), '')::uuid,
    (select e.id from public.events e order by (e.status = 'live') desc, e.created_at, e.id limit 1)
  )
$$;

-- The Programme Manager in the role helpers and account rules ------------------------------

create or replace function private.is_coordinator_plus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('coordinator', 'admin', 'programme_manager', 'super_admin')
$$;

create or replace function private.is_admin_plus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin', 'programme_manager', 'super_admin')
$$;

-- Super Admin manages everyone; a Programme Manager manages Admins and below; an Admin manages
-- staff below Admin. Nobody but a Super Admin creates or changes a Programme Manager.
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to vip_app
  using (
    (select private.has_role('super_admin'))
    or ((select private.has_role('programme_manager')) and role not in ('programme_manager', 'super_admin'))
    or ((select private.has_role('admin')) and role not in ('admin', 'programme_manager', 'super_admin'))
  )
  with check (
    (select private.has_role('super_admin'))
    or ((select private.has_role('programme_manager')) and role not in ('programme_manager', 'super_admin'))
    or ((select private.has_role('admin')) and role not in ('admin', 'programme_manager', 'super_admin'))
  );

create or replace function private.audit_profile_change(
  p_profile_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_after jsonb;
  v_target text;
begin
  if not private.is_admin_plus() then
    raise exception 'Only an Admin, Programme Manager or Super Admin can manage accounts'
      using errcode = '42501', hint = 'forbidden';
  end if;
  if p_action not in ('profiles.create', 'profiles.password_reset') then
    raise exception 'Unsupported account audit action %', p_action using errcode = '22023';
  end if;

  select pg_catalog.to_jsonb(p) into v_after from public.profiles p where p.id = p_profile_id;
  if v_after is null then
    raise exception 'Account % not found', p_profile_id using errcode = 'P0002', hint = 'not_found';
  end if;
  -- Same rule as profiles_update.
  v_target := v_after ->> 'role';
  if not private.has_role('super_admin') and (
       v_target in ('programme_manager', 'super_admin')
       or (v_target = 'admin' and not private.has_role('programme_manager'))
     ) then
    raise exception 'You cannot manage this account' using errcode = '42501', hint = 'forbidden';
  end if;

  insert into public.audit_log (
    event_id, actor_type, actor_id, action, entity_type, entity_id, before, after, reason
  )
  values (
    private.current_event_id(), 'user', private.current_user_id(), p_action, 'profiles',
    p_profile_id, null, v_after, p_reason
  );
end
$$;

-- migrate:down
create or replace function private.audit_profile_change(
  p_profile_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_after jsonb;
begin
  if not private.is_admin_plus() then
    raise exception 'Only an Admin or Super Admin can manage accounts'
      using errcode = '42501', hint = 'forbidden';
  end if;
  if p_action not in ('profiles.create', 'profiles.password_reset') then
    raise exception 'Unsupported account audit action %', p_action using errcode = '22023';
  end if;
  select pg_catalog.to_jsonb(p) into v_after from public.profiles p where p.id = p_profile_id;
  if v_after is null then
    raise exception 'Account % not found', p_profile_id using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_after ->> 'role' in ('admin', 'super_admin') and not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can manage this account' using errcode = '42501', hint = 'forbidden';
  end if;
  insert into public.audit_log (
    event_id, actor_type, actor_id, action, entity_type, entity_id, before, after, reason
  )
  values (
    private.current_event_id(), 'user', private.current_user_id(), p_action, 'profiles',
    p_profile_id, null, v_after, p_reason
  );
end
$$;

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to vip_app
  using (
    (select private.has_role('super_admin'))
    or ((select private.has_role('admin')) and role not in ('admin', 'super_admin'))
  )
  with check (
    (select private.has_role('super_admin'))
    or ((select private.has_role('admin')) and role not in ('admin', 'super_admin'))
  );

create or replace function private.is_admin_plus()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role('admin', 'super_admin') $$;

create or replace function private.is_coordinator_plus()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role('coordinator', 'admin', 'super_admin') $$;

create or replace function private.current_event_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select e.id from public.events e limit 1 $$;

alter table public.profiles drop column if exists active_event_id;
drop table if exists public.event_members;
drop trigger if exists set_event_owner on public.events;
drop function if exists private.set_event_owner();
drop index if exists public.events_owner_idx;
drop index if exists public.events_one_live_per_owner;
alter table public.events drop column if exists owner_id, drop column if exists status;
create unique index events_singleton on public.events ((true));
