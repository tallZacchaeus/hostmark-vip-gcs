-- migrate:up
-- P9 step 9.4 (06-Implementation-Plan.md): managing events from the Events page.
--   * Only Programme Managers and Super Admins create events (the creator owns it, 9.1).
--   * An event's owner, or a Super Admin, manages it: draft → live → archived (also draft →
--     archived); one live event per owner (events_one_live_per_owner, 9.1).
--   * They choose its staff (accounts below Programme Manager) and may copy the setup of an
--     earlier event they work on into a new draft: settings, rooms, VIP categories, drivers, staff.
--   * Each manager's staff stay theirs (security review of 9.4): a Programme Manager or Admin
--     manages an account, and assigns it to events, only if they work on every event it works
--     on; an account on no event yet can be taken on by anyone who manages accounts. Super Admins
--     manage everyone, including people they share between programmes.
-- These are security-definer functions because they act on an event other than the request's
-- own (the restrictive event_scope policies only admit the current event).

drop policy events_insert on public.events;
create policy events_insert on public.events for insert to vip_app
  with check ((select private.has_role('programme_manager', 'super_admin')));

-- Whether the signed-in person manages this event: a Super Admin, or its owner if they are a
-- Programme Manager.
create function private.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('super_admin')
    or (
      private.current_app_role() = 'programme_manager'
      and exists (select 1 from public.events e where e.id = p_event_id and e.owner_id = private.current_user_id())
    )
$$;

-- Refuses unless the signed-in person manages the event: "not found" when they cannot even see
-- it, "forbidden" when they work on it but do not manage it.
create function private.assert_manages_event(p_event_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is null then
    raise exception 'Sign in with an active account' using errcode = '42501', hint = 'unauthenticated';
  end if;
  if p_event_id is null or not exists (select 1 from public.events e where e.id = p_event_id)
     or not private.can_access_event(p_event_id) then
    raise exception 'Not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not private.can_manage_event(p_event_id) then
    raise exception 'Only the event''s Programme Manager or a Super Admin can manage it'
      using errcode = '42501', hint = 'forbidden';
  end if;
end
$$;

-- Whether the signed-in person may manage this account: a Super Admin always; anyone else only
-- when they work on every event the account works on (so nobody reaches into another
-- programme's team through a shared or poached account).
create function private.may_manage_account(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('super_admin') or not exists (
    select 1 from public.event_members m
    where m.profile_id = p_profile_id
      and not private.works_on_event(private.current_user_id(), m.event_id)
  )
$$;

-- An account that may be put on an event's team: active and below Programme Manager.
create function private.is_assignable_staff(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.role not in ('super_admin', 'programme_manager') and not p.banned
  )
$$;

-- Called by the API before it changes an account outside the database (a password reset goes
-- through the auth library first), so the refusal comes before anything happens.
create function public.assert_may_manage_account(p_profile_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is null then
    raise exception 'Sign in with an active account' using errcode = '42501', hint = 'unauthenticated';
  end if;
  if not private.may_manage_account(p_profile_id) then
    raise exception 'This person also works on an event you do not manage; ask a Super Admin'
      using errcode = '42501', hint = 'forbidden';
  end if;
end
$$;

-- Account changes (name, role, deactivation) follow the same rule; your own row stays yours.
create policy account_scope on public.profiles as restrictive for update to vip_app
  using (id = (select private.current_user_id()) or private.may_manage_account(id))
  with check (id = (select private.current_user_id()) or private.may_manage_account(id));

-- Direct team changes (an Admin's new account joins their event) obey the same rules.
drop policy event_members_insert on public.event_members;
create policy event_members_insert on public.event_members for insert to vip_app
  with check (
    (select private.is_admin_plus())
    and private.is_assignable_staff(profile_id)
    and private.may_manage_account(profile_id)
  );
drop policy event_members_delete on public.event_members;
create policy event_members_delete on public.event_members for delete to vip_app
  using ((select private.is_admin_plus()) and private.may_manage_account(profile_id));

-- The events this person manages (a Super Admin: every event), for the Events page.
create function public.manageable_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', e.id, 'name', e.name, 'venue_name', e.venue_name, 'status', e.status,
      'starts_on', e.starts_on, 'ends_on', e.ends_on, 'owner_id', e.owner_id,
      'owner_name', o.full_name,
      'member_count', (select pg_catalog.count(*) from public.event_members m where m.event_id = e.id),
      'is_current', e.id = private.current_event_id()
    ) order by (e.status = 'live') desc, e.status = 'archived', e.starts_on desc, e.name), '[]'::jsonb)
  from public.events e
  left join public.profiles o on o.id = e.owner_id
  where private.can_manage_event(e.id)
$$;

create function public.set_event_status(p_event_id uuid, p_status text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_from text;
begin
  perform private.assert_manages_event(p_event_id);
  select e.status into v_from from public.events e where e.id = p_event_id for update;
  if not ((v_from = 'draft' and p_status in ('live', 'archived')) or (v_from = 'live' and p_status = 'archived')) then
    raise exception 'An event goes from draft to live to archived, and an archived event stays archived'
      using errcode = '22023', hint = 'invalid_transition';
  end if;
  begin
    update public.events set status = p_status where id = p_event_id;
  exception when unique_violation then
    raise exception 'This manager already has a live event; archive it first'
      using errcode = '55000', hint = 'live_event_exists';
  end;
  return p_status;
end
$$;

-- Accounts that may work on an event (below Programme Manager, not banned), and whether they do.
create function public.event_staff(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_manages_event(p_event_id);
  return (
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role,
        'is_member', exists (select 1 from public.event_members m where m.event_id = p_event_id and m.profile_id = p.id)
      ) order by p.full_name, p.id), '[]'::jsonb)
    from public.profiles p
    where p.role not in ('super_admin', 'programme_manager') and not p.banned
      and private.may_manage_account(p.id)
  );
end
$$;

create function public.set_event_member(p_event_id uuid, p_profile_id uuid, p_member boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_manages_event(p_event_id);
  -- Locked, so a concurrent archive cannot slip between the check and the change.
  perform 1 from public.events e where e.id = p_event_id for update;
  if not private.event_is_writable(p_event_id) then
    raise exception 'This event is archived and read-only' using errcode = '42501', hint = 'event_archived';
  end if;
  if p_member and not private.is_assignable_staff(p_profile_id) then
    raise exception 'Only active staff accounts below Programme Manager are assigned to events'
      using errcode = '22023', hint = 'invalid_member';
  end if;
  if not private.may_manage_account(p_profile_id) then
    raise exception 'This person works on an event you do not manage; ask a Super Admin'
      using errcode = '42501', hint = 'forbidden';
  end if;
  if p_member then
    insert into public.event_members (event_id, profile_id, added_by)
    values (p_event_id, p_profile_id, private.current_user_id())
    on conflict do nothing;
  else
    delete from public.event_members where event_id = p_event_id and profile_id = p_profile_id;
    update public.profiles set active_event_id = null
    where id = p_profile_id and active_event_id = p_event_id;
  end if;
end
$$;

-- Copies parts of an earlier event's setup into a new draft. Rooms come back in service and
-- clean; drivers come without shifts (dates differ); a driver's account joins the new event.
create function public.copy_event_setup(p_target_id uuid, p_source_id uuid, p_parts text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_type record;
  v_new_type uuid;
  v_types int := 0;
  v_rooms int := 0;
  v_count int;
begin
  perform private.assert_manages_event(p_target_id);
  if p_source_id is null or p_source_id = p_target_id or not private.can_access_event(p_source_id) then
    raise exception 'Not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_parts is null or pg_catalog.cardinality(p_parts) = 0
     or not (p_parts <@ array['settings', 'rooms', 'categories', 'drivers', 'staff']) then
    raise exception 'Choose what to copy: settings, rooms, categories, drivers or staff' using errcode = '22023';
  end if;
  -- Locked, so the draft cannot go live while its setup is being copied.
  if (select e.status from public.events e where e.id = p_target_id for update) <> 'draft' then
    raise exception 'Setup is copied only into a draft event' using errcode = '42501', hint = 'event_not_draft';
  end if;
  if ('rooms' = any (p_parts) and exists (select 1 from public.room_types t where t.event_id = p_target_id))
     or ('categories' = any (p_parts) and exists (select 1 from public.vip_categories c where c.event_id = p_target_id))
     or ('drivers' = any (p_parts) and exists (select 1 from public.drivers d where d.event_id = p_target_id)) then
    raise exception 'This event already has that setup' using errcode = '55000', hint = 'already_set_up';
  end if;

  if 'settings' = any (p_parts) then
    update public.events t set
      arrival_airports = s.arrival_airports, coordinator_phone = s.coordinator_phone,
      intake_window_days = s.intake_window_days, airport_exit_buffer_min = s.airport_exit_buffer_min,
      airport_travel_min = s.airport_travel_min, local_travel_min = s.local_travel_min,
      delay_threshold_min = s.delay_threshold_min, cleaning_delay_buffer_min = s.cleaning_delay_buffer_min,
      program_lead_time_min = s.program_lead_time_min, auto_process_enabled = s.auto_process_enabled
    from public.events s
    where t.id = p_target_id and s.id = p_source_id;
  end if;

  if 'rooms' = any (p_parts) then
    for v_type in select * from public.room_types where event_id = p_source_id order by tier, name loop
      insert into public.room_types (event_id, name, tier, default_capacity, cleaning_minutes)
      values (p_target_id, v_type.name, v_type.tier, v_type.default_capacity, v_type.cleaning_minutes)
      returning id into v_new_type;
      insert into public.rooms (event_id, number, floor, wing, room_type_id, capacity, is_accessible, notes, position)
      select p_target_id, r.number, r.floor, r.wing, v_new_type, r.capacity, r.is_accessible, r.notes, r.position
      from public.rooms r where r.room_type_id = v_type.id;
      get diagnostics v_count = row_count;
      v_types := v_types + 1;
      v_rooms := v_rooms + v_count;
    end loop;
    v_counts := v_counts || pg_catalog.jsonb_build_object('room_types', v_types, 'rooms', v_rooms);
  end if;

  if 'categories' = any (p_parts) then
    insert into public.vip_categories (event_id, name, rank, preferred_room_tier)
    select p_target_id, c.name, c.rank, c.preferred_room_tier
    from public.vip_categories c where c.event_id = p_source_id;
    get diagnostics v_count = row_count;
    v_counts := v_counts || pg_catalog.jsonb_build_object('categories', v_count);
  end if;

  if 'drivers' = any (p_parts) then
    insert into public.drivers (event_id, full_name, phone, vehicle_capacity, vehicle_label, profile_id)
    select p_target_id, d.full_name, d.phone, d.vehicle_capacity, d.vehicle_label, d.profile_id
    from public.drivers d where d.event_id = p_source_id and d.is_active;
    get diagnostics v_count = row_count;
    v_counts := v_counts || pg_catalog.jsonb_build_object('drivers', v_count);
    insert into public.event_members (event_id, profile_id, added_by)
    select p_target_id, d.profile_id, private.current_user_id()
    from public.drivers d
    where d.event_id = p_target_id and d.profile_id is not null
      and private.is_assignable_staff(d.profile_id) and private.may_manage_account(d.profile_id)
    on conflict do nothing;
  end if;

  if 'staff' = any (p_parts) then
    insert into public.event_members (event_id, profile_id, added_by)
    select p_target_id, m.profile_id, private.current_user_id()
    from public.event_members m
    where m.event_id = p_source_id
      and private.is_assignable_staff(m.profile_id) and private.may_manage_account(m.profile_id)
    on conflict do nothing;
  end if;

  if 'staff' = any (p_parts) or 'drivers' = any (p_parts) then
    v_counts := v_counts || pg_catalog.jsonb_build_object(
      'staff', (select pg_catalog.count(*) from public.event_members m where m.event_id = p_target_id));
  end if;
  return v_counts;
end
$$;

revoke all on function private.can_manage_event(uuid) from public;
revoke all on function private.may_manage_account(uuid) from public;
revoke all on function private.is_assignable_staff(uuid) from public;
revoke all on function public.assert_may_manage_account(uuid) from public;
revoke all on function private.assert_manages_event(uuid) from public;
revoke all on function public.manageable_events() from public;
revoke all on function public.set_event_status(uuid, text) from public;
revoke all on function public.event_staff(uuid) from public;
revoke all on function public.set_event_member(uuid, uuid, boolean) from public;
revoke all on function public.copy_event_setup(uuid, uuid, text[]) from public;
-- (Policies on event_members and profiles call these as vip_app.)
grant execute on function private.may_manage_account(uuid) to vip_app;
grant execute on function private.is_assignable_staff(uuid) to vip_app;
grant execute on function public.assert_may_manage_account(uuid) to vip_app;
grant execute on function public.manageable_events() to vip_app;
grant execute on function public.set_event_status(uuid, text) to vip_app;
grant execute on function public.event_staff(uuid) to vip_app;
grant execute on function public.set_event_member(uuid, uuid, boolean) to vip_app;
grant execute on function public.copy_event_setup(uuid, uuid, text[]) to vip_app;

-- migrate:down
drop function if exists public.copy_event_setup(uuid, uuid, text[]);
drop function if exists public.set_event_member(uuid, uuid, boolean);
drop function if exists public.event_staff(uuid);
drop function if exists public.set_event_status(uuid, text);
drop function if exists public.manageable_events();
drop policy if exists event_members_delete on public.event_members;
create policy event_members_delete on public.event_members for delete to vip_app
  using ((select private.is_admin_plus()));
drop policy if exists event_members_insert on public.event_members;
create policy event_members_insert on public.event_members for insert to vip_app
  with check ((select private.is_admin_plus()));
drop policy if exists account_scope on public.profiles;
drop function if exists public.assert_may_manage_account(uuid);
drop function if exists private.is_assignable_staff(uuid);
drop function if exists private.may_manage_account(uuid);
drop function if exists private.assert_manages_event(uuid);
drop function if exists private.can_manage_event(uuid);

drop policy events_insert on public.events;
create policy events_insert on public.events for insert to vip_app
  with check ((select private.is_admin_plus()));
