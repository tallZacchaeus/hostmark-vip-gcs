-- migrate:up
-- P9 step 9.2 (06-Implementation-Plan.md): isolation between events. Staff of one event can
-- neither read nor change another event's data, archived events are read-only, and everything is
-- enforced in the database:
--   * private.current_event_id() returns the request's event only if the signed-in person works
--     on it (member, owner, or Super Admin); otherwise null, so every event table looks empty.
--   * One RESTRICTIVE policy per table with event_id (ANDed with the existing permissive ones), so
--     none of the 51 existing policies had to be rewritten; driver_shifts, program_participants,
--     events and profiles get their own.
--   * The API's security-definer actions that take a record id are wrapped: the wrapper checks
--     the record belongs to the current (writable) event, then calls the original, which moved to
--     private.<name>__unscoped and is not callable by the API.
--   * Functions that read "the" event now read the current one (generated from their latest
--     definitions by db/tooling/generators/event_isolation_functions.py).
-- Checks apply to signed-in people (vip_app with app.user_id). Trusted server work (vip_system)
-- that names an event (app.event_id) is confined to it; without one it is unrestricted, as are
-- migrations (the owner).

-- Who works on which event -------------------------------------------------------------------

create function private.works_on_event(p_profile_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id is not null and p_event_id is not null and (
    exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'super_admin')
    or exists (select 1 from public.events e where e.id = p_event_id and e.owner_id = p_profile_id)
    or exists (select 1 from public.event_members m where m.event_id = p_event_id and m.profile_id = p_profile_id)
  )
$$;

-- The signed-in person may work in this event (an active account that works on it).
create function private.can_access_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role() is not null
    and private.works_on_event(private.current_user_id(), p_event_id)
$$;

create or replace function private.current_event_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chosen uuid := nullif(pg_catalog.current_setting('app.event_id', true), '')::uuid;
  v_user uuid := private.current_user_id();
  v_event uuid;
begin
  -- Trusted server work and migrations: the chosen event, else the live (or oldest) one.
  if v_user is null then
    return coalesce(
      v_chosen,
      (select e.id from public.events e order by (e.status = 'live') desc, e.created_at, e.id limit 1)
    );
  end if;
  -- A signed-in person: only an event they work on.
  if v_chosen is not null then
    return case when private.can_access_event(v_chosen) then v_chosen end;
  end if;
  select p.active_event_id into v_event from public.profiles p where p.id = v_user;
  if v_event is not null and private.can_access_event(v_event) then
    return v_event;
  end if;
  return (
    select e.id from public.events e
    where private.can_access_event(e.id)
    order by (e.status = 'live') desc, e.created_at, e.id
    limit 1
  );
end
$$;

-- Writes need an event: with none available (none set up yet, or none this person works on), say
-- so plainly instead of a bare permission error.
create function private.require_current_event()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event uuid := private.current_event_id();
begin
  if v_event is null then
    raise exception 'Set up or choose an event first' using errcode = '55000', hint = 'event_not_found';
  end if;
  return v_event;
end
$$;

-- Archived events are read-only.
create function private.current_event_writable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.status <> 'archived' from public.events e where e.id = private.current_event_id()), false)
$$;

-- Whether an event takes writes (not archived). Used for trusted server work, which names its event.
create function private.event_is_writable(p_event_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select e.status <> 'archived' from public.events e where e.id = p_event_id), true) $$;

-- The event trusted server work named for this transaction (app.event_id), or null.
create function private.system_event_id()
returns uuid language sql stable set search_path = ''
as $$ select nullif(pg_catalog.current_setting('app.event_id', true), '')::uuid $$;

create function private.event_of_driver(p_driver_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select d.event_id from public.drivers d where d.id = p_driver_id $$;

create function private.event_of_program_item(p_item_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select i.event_id from public.program_items i where i.id = p_item_id $$;

grant execute on function private.works_on_event(uuid, uuid) to vip_app, vip_system;
grant execute on function private.can_access_event(uuid) to vip_app, vip_system;
grant execute on function private.current_event_writable() to vip_app, vip_system;
grant execute on function private.require_current_event() to vip_app, vip_system;
grant execute on function private.event_of_driver(uuid) to vip_app, vip_system;
grant execute on function private.system_event_id() to vip_app, vip_system;
grant execute on function private.event_is_writable(uuid) to vip_app, vip_system;
grant execute on function private.event_of_program_item(uuid) to vip_app, vip_system;

-- Functions that read "the" event, the role helper and the notification fan-out (generated) -----

-- >>> generated by db/tooling/generators/event_isolation_functions.py (up)
create or replace function private.has_role(variadic p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_app_role() = any (p_roles)
    or (private.current_app_role() = 'programme_manager' and 'admin' = any (p_roles)),
    false
  )
$$;

create or replace function private.notify_roles(
  p_roles public.app_role[],
  p_kind text,
  p_title text,
  p_body text default null,
  p_priority text default 'normal',
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select private.notify_users(
    array(
      select p.id from public.profiles p
      where (p.role = any (p_roles) or (p.role = 'programme_manager' and 'admin' = any (p_roles)))
        and not p.banned
        and private.works_on_event(p.id, private.current_event_id())
    ),
    p_kind, p_title, p_body, p_priority, p_entity_type, p_entity_id
  )
$$;

create or replace function private.my_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.drivers d
  where d.profile_id = private.current_user_id() and d.is_active and private.has_role('driver')
    and d.event_id = private.current_event_id()
$$;

create or replace function public.get_event_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if private.current_app_role() is null then
    raise exception 'Sign in with an active account' using errcode = '42501', hint = 'unauthenticated';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', e.id, 'name', e.name, 'venue_name', e.venue_name, 'timezone', e.timezone,
    'starts_on', e.starts_on, 'ends_on', e.ends_on, 'flight_mode', e.flight_mode,
    'coordinator_phone', e.coordinator_phone
  )
  into v_result
  from public.events e
  where e.id = private.current_event_id();

  return v_result;
end
$$;

create or replace function public.my_driver_pickups(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := private.my_driver_id();
  v_tz text;
  v_starts date;
  v_ends date;
begin
  if v_driver_id is null then
    raise exception 'This account is not linked to an active driver' using errcode = '42501', hint = 'not_a_driver';
  end if;
  select e.timezone, e.starts_on, e.ends_on into v_tz, v_starts, v_ends from public.events e where e.id = private.current_event_id();
  if p_day is null or p_day < v_starts - 1 or p_day > v_ends + 1 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(trip order by trip ->> 'pickup_at')
    from (
      select case when a.status = 'released' then pg_catalog.jsonb_build_object(
        'assignment_id', a.id,
        'status', a.status,
        'released_at', a.released_at,
        'pickup_id', p.id,
        'pickup_status', p.status,
        'kind', p.kind,
        'pickup_at', p.pickup_at,
        'passenger_count', p.passenger_count,
        'principal', pg_catalog.jsonb_build_object('title', g.title, 'full_name', g.full_name, 'category', null)
      ) else pg_catalog.jsonb_build_object(
        'assignment_id', a.id,
        'status', a.status,
        'acknowledged_at', a.acknowledged_at,
        'en_route_at', a.en_route_at,
        'picked_up_at', a.picked_up_at,
        'completed_at', a.completed_at,
        'released_at', a.released_at,
        'pickup_id', p.id,
        'pickup_status', p.status,
        'kind', p.kind,
        'pickup_at', p.pickup_at,
        'previous_pickup_at', p.previous_pickup_at,
        'changed_at', p.changed_at,
        'pickup_location', p.pickup_location,
        'dropoff_location', p.dropoff_location,
        'passenger_count', p.passenger_count,
        'flight_number', f.flight_number,
        'flight_phase', f.phase,
        'delay_minutes', f.delay_minutes,
        'principal', pg_catalog.jsonb_build_object('title', g.title, 'full_name', g.full_name, 'category', vc.name),
        'passengers', (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('title', m.title, 'full_name', m.full_name, 'role', m.member_role)
            order by m.member_role = 'principal' desc, m.created_at
          )
          from public.guests m
          where m.arrival_id = ar.id and m.status <> 'cancelled'
        )
      ) end as trip
      from public.pickup_assignments a
      join public.pickups p on p.id = a.pickup_id
      join public.arrivals ar on ar.id = p.arrival_id
      join public.delegations dl on dl.id = ar.delegation_id
      left join public.guests g on g.id = dl.principal_guest_id
      left join public.vip_categories vc on vc.id = g.vip_category_id
      left join public.flights f on f.id = ar.flight_id
      where a.driver_id = v_driver_id
        and (p.pickup_at at time zone v_tz)::date = p_day
    ) trips
  ), '[]'::jsonb);
end
$$;

create or replace function private.lock_event_for_super_admin()
returns public.events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can export or remove event data' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into v_event from public.events where id = private.current_event_id() for update;
  if not found then
    raise exception 'Set up the event first' using errcode = 'P0002', hint = 'event_not_found';
  end if;
  return v_event;
end
$$;

create or replace function public.regenerate_intake_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.is_admin_plus() then
    raise exception 'Only an Admin or Super Admin can regenerate the intake link'
      using errcode = '42501', hint = 'forbidden';
  end if;

  update public.events set intake_token = private.new_intake_token()
  where id = private.current_event_id() and private.current_event_writable()
  returning intake_token into v_token;

  if v_token is null then
    raise exception 'Set up the event first' using errcode = 'P0002', hint = 'event_not_found';
  end if;
  return v_token;
end
$$;

create or replace function public.intake_link_context(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'open', e.intake_open and e.status <> 'archived',
    'event_name', e.name,
    'venue_name', e.venue_name,
    'timezone', e.timezone,
    'starts_on', e.starts_on,
    'ends_on', e.ends_on
  )
  from public.events e
  where e.intake_token = p_token
$$;

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
  if not private.has_role('super_admin') and not private.works_on_event(p_profile_id, private.current_event_id()) then
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

create or replace function public.cleaning_queue(p_since timestamptz default null)
returns table (
  task_id uuid,
  room_id uuid,
  room_number text,
  floor smallint,
  wing text,
  room_type text,
  status public.cleaning_status,
  checked_out_at timestamptz,
  estimated_ready_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cleaning_minutes integer,
  buffer_minutes integer,
  needed_by timestamptz,
  problem_kind public.cleaning_problem,
  problem_note text,
  undoable boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_coordinator_plus() or private.has_role('housekeeping', 'accommodation')) then
    raise exception 'Only housekeeping, the front desk and coordinators can see the cleaning queue' using errcode = '42501', hint = 'forbidden';
  end if;
  return query
  select t.id, r.id, r.number, r.floor, r.wing, rt.name, t.status, t.checked_out_at, t.estimated_ready_at,
    t.started_at, t.completed_at, rt.cleaning_minutes, e.cleaning_delay_buffer_min,
    (select pg_catalog.min(a.expected_check_in_at) from public.room_assignments a where a.room_id = r.id and a.status = 'planned'),
    t.problem_kind, t.problem_note,
    t.status = 'done' and t.completed_at > pg_catalog.now() - interval '10 minutes'
      and (t.completed_by = private.current_user_id() or private.is_coordinator_plus())
  from public.cleaning_tasks t
  join public.rooms r on r.id = t.room_id
  join public.room_types rt on rt.id = r.room_type_id
  join public.events e on e.id = r.event_id
  where t.event_id = private.current_event_id()
    and (t.status in ('pending', 'in_progress') or (p_since is not null and t.status = 'done' and t.completed_at >= p_since));
end
$$;
-- <<< generated (up)

-- The same person can drive in several events (one driver record per event) --------------------

alter table public.drivers drop constraint if exists drivers_profile_id_key;
alter table public.drivers add constraint drivers_profile_once_per_event unique (event_id, profile_id);

-- Row-level security: the event scope on every table that has event_id -------------------------

do $$
declare
  v_table text;
begin
  for v_table in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'event_id' and t.table_type = 'BASE TABLE'
    order by 1
  loop
    execute pg_catalog.format(
      'create policy event_scope on public.%I as restrictive for all to vip_app
         using (event_id = (select private.current_event_id()))
         with check (event_id = (select private.require_current_event()) and (select private.current_event_writable()))',
      v_table);
    execute pg_catalog.format(
      'create policy event_not_archived on public.%I as restrictive for delete to vip_app
         using ((select private.current_event_writable()))',
      v_table);
    -- Trusted server work that names an event (a worker pass, a registration, system work during
    -- a request) sees and writes only that event; without one (Better Auth, leases) it is unchanged.
    execute pg_catalog.format(
      'create policy system_event_scope on public.%I as restrictive for all to vip_system
         using ((select private.system_event_id()) is null or event_id = (select private.system_event_id()))
         with check ((select private.system_event_id()) is null or (event_id = (select private.system_event_id()) and private.event_is_writable(event_id)))',
      v_table);
  end loop;
end
$$;

create policy event_scope on public.driver_shifts as restrictive for all to vip_app
  using (private.event_of_driver(driver_id) = (select private.current_event_id()))
  with check (private.event_of_driver(driver_id) = (select private.require_current_event()) and (select private.current_event_writable()));
create policy event_not_archived on public.driver_shifts as restrictive for delete to vip_app
  using ((select private.current_event_writable()));

create policy system_event_scope on public.driver_shifts as restrictive for all to vip_system
  using ((select private.system_event_id()) is null or private.event_of_driver(driver_id) = (select private.system_event_id()))
  with check ((select private.system_event_id()) is null or (private.event_of_driver(driver_id) = (select private.system_event_id()) and private.event_is_writable(private.event_of_driver(driver_id))));

create policy event_scope on public.program_participants as restrictive for all to vip_app
  using (private.event_of_program_item(program_item_id) = (select private.current_event_id()))
  with check (private.event_of_program_item(program_item_id) = (select private.require_current_event()) and (select private.current_event_writable()));
create policy event_not_archived on public.program_participants as restrictive for delete to vip_app
  using ((select private.current_event_writable()));

create policy system_event_scope on public.program_participants as restrictive for all to vip_system
  using ((select private.system_event_id()) is null or private.event_of_program_item(program_item_id) = (select private.system_event_id()))
  with check ((select private.system_event_id()) is null or (private.event_of_program_item(program_item_id) = (select private.system_event_id()) and private.event_is_writable(private.event_of_program_item(program_item_id))));

-- Events: people see the events they work on; settings change only in the current event.
-- (The owner check comes first: a lookup cannot see the row an INSERT ... RETURNING is adding.)
create policy event_scope_select on public.events as restrictive for select to vip_app
  using (owner_id = (select private.current_user_id()) or private.can_access_event(id));
-- (An archived event's settings are read-only too.)
create policy event_scope_update on public.events as restrictive for update to vip_app
  using (id = (select private.current_event_id()) and (select private.current_event_writable()))
  with check (id = (select private.current_event_id()));

-- Accounts: yourself, and the people who work on the current event (Super Admins see everyone).
create policy event_scope on public.profiles as restrictive for all to vip_app
  using (
    id = (select private.current_user_id())
    or (select private.has_role('super_admin'))
    or private.works_on_event(id, (select private.current_event_id()))
  )
  with check (
    id = (select private.current_user_id())
    or (select private.has_role('super_admin'))
    or private.works_on_event(id, (select private.current_event_id()))
  );

-- The API's actions on a record: the record must belong to the current event --------------------

-- p_table: an event table, or (for copilot_propose) whatever target the caller named; ids of
-- tables without event_id, and unknown ids, are left to the function to judge.
create function private.assert_in_current_event(p_table text, p_id text, p_writes boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event uuid;
begin
  if p_id is null or private.current_user_id() is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p_table and c.column_name = 'event_id'
  ) then
    return;
  end if;
  execute pg_catalog.format('select event_id from public.%I where id = %L', p_table, p_id) into v_event;
  if v_event is null then
    return;
  end if;
  if v_event is distinct from private.current_event_id() then
    raise exception 'Not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if p_writes and not private.current_event_writable() then
    raise exception 'This event is archived and read-only' using errcode = '42501', hint = 'event_archived';
  end if;
end
$$;
revoke all on function private.assert_in_current_event(text, text, boolean) from public;

do $$
declare
  v_spec record;
  v_fn oid;
  v_identity text;
  v_arguments text;
  v_result text;
  v_nargs int;
  v_call text;
  v_checks text := '';
  i int;
begin
  for v_spec in
    select * from (values
    ('public', 'acknowledge_assignment', array['pickup_assignments']::text[], array[1]::int[], true),
    ('public', 'approve_proposal', array['proposals']::text[], array[1]::int[], true),
    ('public', 'assign_room', array['guests', 'rooms']::text[], array[1, 2]::int[], true),
    ('public', 'check_in_party', array['delegations']::text[], array[1]::int[], true),
    ('public', 'check_out_party', array['delegations']::text[], array[1]::int[], true),
    ('public', 'complete_cleaning', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'notify_program_risk', array['program_items']::text[], array[1]::int[], true),
    ('public', 'reject_proposal', array['proposals']::text[], array[1]::int[], true),
    ('public', 'report_cleaning_problem', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'reverse_checkout', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'set_trip_status', array['pickup_assignments']::text[], array[1]::int[], true),
    ('public', 'start_cleaning', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'undo_audit_entry', array['audit_log']::text[], array[1]::int[], true),
    ('public', 'undo_check_in', array['delegations']::text[], array[1]::int[], true),
    ('public', 'undo_complete_cleaning', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'copilot_propose', array['$5']::text[], array[6]::int[], true),
    ('private', 'room_ready_at', array['rooms']::text[], array[1]::int[], false)
    ) as s(schema_name, fn, tables, positions, writes)
  loop
    select p.oid, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_function_arguments(p.oid),
           pg_catalog.pg_get_function_result(p.oid), p.pronargs
      into v_fn, v_identity, v_arguments, v_result, v_nargs
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = v_spec.schema_name and p.proname = v_spec.fn;
    if v_fn is null then
      raise exception 'Function %.% not found', v_spec.schema_name, v_spec.fn;
    end if;

    execute pg_catalog.format('alter function %I.%I(%s) rename to %I', v_spec.schema_name, v_spec.fn, v_identity, v_spec.fn || '__unscoped');
    if v_spec.schema_name <> 'private' then
      execute pg_catalog.format('alter function %I.%I(%s) set schema private', v_spec.schema_name, v_spec.fn || '__unscoped', v_identity);
    end if;
    execute pg_catalog.format('revoke all on function private.%I(%s) from public, vip_app, vip_system', v_spec.fn || '__unscoped', v_identity);

    v_call := (select pg_catalog.string_agg('$' || n, ', ' order by n) from pg_catalog.generate_series(1, v_nargs) n);
    v_checks := '';
    for i in 1 .. pg_catalog.array_length(v_spec.tables, 1) loop
      v_checks := v_checks || pg_catalog.format(
        '  perform private.assert_in_current_event(%s, $%s::text, %s);' || chr(10),
        case when v_spec.tables[i] like '$%' then v_spec.tables[i] || '::text' else pg_catalog.quote_literal(v_spec.tables[i]) end,
        v_spec.positions[i],
        case when v_spec.writes then 'true' else 'false' end);
    end loop;

    execute pg_catalog.format(
      'create function %I.%I(%s) returns %s language plpgsql volatile security definer set search_path = '''' as $w$
begin
%s  %s
end
$w$', v_spec.schema_name, v_spec.fn, v_arguments, v_result, v_checks,
      case
        when v_result = 'void' then pg_catalog.format('perform private.%I(%s); return;', v_spec.fn || '__unscoped', v_call)
        when v_result like 'TABLE(%' or v_result like 'SETOF %' then pg_catalog.format('return query select * from private.%I(%s);', v_spec.fn || '__unscoped', v_call)
        else pg_catalog.format('return private.%I(%s);', v_spec.fn || '__unscoped', v_call)
      end);
    execute pg_catalog.format('revoke all on function %I.%I(%s) from public', v_spec.schema_name, v_spec.fn, v_identity);
    execute pg_catalog.format('grant execute on function %I.%I(%s) to vip_app, vip_system', v_spec.schema_name, v_spec.fn, v_identity);
  end loop;
end
$$;

-- migrate:down
do $$
declare
  v_spec record;
  v_identity text;
begin
  for v_spec in
    select * from (values
    ('public', 'acknowledge_assignment', array['pickup_assignments']::text[], array[1]::int[], true),
    ('public', 'approve_proposal', array['proposals']::text[], array[1]::int[], true),
    ('public', 'assign_room', array['guests', 'rooms']::text[], array[1, 2]::int[], true),
    ('public', 'check_in_party', array['delegations']::text[], array[1]::int[], true),
    ('public', 'check_out_party', array['delegations']::text[], array[1]::int[], true),
    ('public', 'complete_cleaning', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'notify_program_risk', array['program_items']::text[], array[1]::int[], true),
    ('public', 'reject_proposal', array['proposals']::text[], array[1]::int[], true),
    ('public', 'report_cleaning_problem', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'reverse_checkout', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'set_trip_status', array['pickup_assignments']::text[], array[1]::int[], true),
    ('public', 'start_cleaning', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'undo_audit_entry', array['audit_log']::text[], array[1]::int[], true),
    ('public', 'undo_check_in', array['delegations']::text[], array[1]::int[], true),
    ('public', 'undo_complete_cleaning', array['cleaning_tasks']::text[], array[1]::int[], true),
    ('public', 'copilot_propose', array['$5']::text[], array[6]::int[], true),
    ('private', 'room_ready_at', array['rooms']::text[], array[1]::int[], false)
    ) as s(schema_name, fn, tables, positions, writes)
  loop
    select pg_catalog.pg_get_function_identity_arguments(p.oid) into v_identity
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = v_spec.fn || '__unscoped';
    execute pg_catalog.format('drop function %I.%I(%s)', v_spec.schema_name, v_spec.fn, v_identity);
    if v_spec.schema_name <> 'private' then
      execute pg_catalog.format('alter function private.%I(%s) set schema %I', v_spec.fn || '__unscoped', v_identity, v_spec.schema_name);
    end if;
    execute pg_catalog.format('alter function %I.%I(%s) rename to %I', v_spec.schema_name, v_spec.fn || '__unscoped', v_identity, v_spec.fn);
    execute pg_catalog.format('grant execute on function %I.%I(%s) to vip_app', v_spec.schema_name, v_spec.fn, v_identity);
  end loop;
end
$$;
drop function if exists private.assert_in_current_event(text, text, boolean);

drop policy if exists event_scope on public.profiles;
drop policy if exists event_scope_update on public.events;
drop policy if exists event_scope_select on public.events;
do $$
declare
  v_table text;
begin
  for v_table in
    select distinct tablename from pg_catalog.pg_policies
    where schemaname = 'public' and policyname in ('event_scope', 'event_not_archived', 'system_event_scope')
  loop
    execute pg_catalog.format('drop policy if exists event_scope on public.%I', v_table);
    execute pg_catalog.format('drop policy if exists event_not_archived on public.%I', v_table);
    execute pg_catalog.format('drop policy if exists system_event_scope on public.%I', v_table);
  end loop;
end
$$;

alter table public.drivers drop constraint if exists drivers_profile_once_per_event;
alter table public.drivers add constraint drivers_profile_id_key unique (profile_id);

-- >>> generated by db/tooling/generators/event_isolation_functions.py (down)
create or replace function private.has_role(variadic p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (p_roles), false)
$$;

create or replace function private.notify_roles(
  p_roles public.app_role[],
  p_kind text,
  p_title text,
  p_body text default null,
  p_priority text default 'normal',
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select private.notify_users(
    array(
      select p.id from public.profiles p
      where p.role = any (p_roles) and not p.banned
    ),
    p_kind, p_title, p_body, p_priority, p_entity_type, p_entity_id
  )
$$;

create or replace function private.my_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.drivers d
  where d.profile_id = private.current_user_id() and d.is_active and private.has_role('driver')
$$;

create or replace function public.get_event_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if private.current_app_role() is null then
    raise exception 'Sign in with an active account' using errcode = '42501', hint = 'unauthenticated';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', e.id, 'name', e.name, 'venue_name', e.venue_name, 'timezone', e.timezone,
    'starts_on', e.starts_on, 'ends_on', e.ends_on, 'flight_mode', e.flight_mode,
    'coordinator_phone', e.coordinator_phone
  )
  into v_result
  from public.events e;

  return v_result;
end
$$;

create or replace function public.my_driver_pickups(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := private.my_driver_id();
  v_tz text;
  v_starts date;
  v_ends date;
begin
  if v_driver_id is null then
    raise exception 'This account is not linked to an active driver' using errcode = '42501', hint = 'not_a_driver';
  end if;
  select e.timezone, e.starts_on, e.ends_on into v_tz, v_starts, v_ends from public.events e limit 1;
  if p_day is null or p_day < v_starts - 1 or p_day > v_ends + 1 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(trip order by trip ->> 'pickup_at')
    from (
      select case when a.status = 'released' then pg_catalog.jsonb_build_object(
        'assignment_id', a.id,
        'status', a.status,
        'released_at', a.released_at,
        'pickup_id', p.id,
        'pickup_status', p.status,
        'kind', p.kind,
        'pickup_at', p.pickup_at,
        'passenger_count', p.passenger_count,
        'principal', pg_catalog.jsonb_build_object('title', g.title, 'full_name', g.full_name, 'category', null)
      ) else pg_catalog.jsonb_build_object(
        'assignment_id', a.id,
        'status', a.status,
        'acknowledged_at', a.acknowledged_at,
        'en_route_at', a.en_route_at,
        'picked_up_at', a.picked_up_at,
        'completed_at', a.completed_at,
        'released_at', a.released_at,
        'pickup_id', p.id,
        'pickup_status', p.status,
        'kind', p.kind,
        'pickup_at', p.pickup_at,
        'previous_pickup_at', p.previous_pickup_at,
        'changed_at', p.changed_at,
        'pickup_location', p.pickup_location,
        'dropoff_location', p.dropoff_location,
        'passenger_count', p.passenger_count,
        'flight_number', f.flight_number,
        'flight_phase', f.phase,
        'delay_minutes', f.delay_minutes,
        'principal', pg_catalog.jsonb_build_object('title', g.title, 'full_name', g.full_name, 'category', vc.name),
        'passengers', (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('title', m.title, 'full_name', m.full_name, 'role', m.member_role)
            order by m.member_role = 'principal' desc, m.created_at
          )
          from public.guests m
          where m.arrival_id = ar.id and m.status <> 'cancelled'
        )
      ) end as trip
      from public.pickup_assignments a
      join public.pickups p on p.id = a.pickup_id
      join public.arrivals ar on ar.id = p.arrival_id
      join public.delegations dl on dl.id = ar.delegation_id
      left join public.guests g on g.id = dl.principal_guest_id
      left join public.vip_categories vc on vc.id = g.vip_category_id
      left join public.flights f on f.id = ar.flight_id
      where a.driver_id = v_driver_id
        and (p.pickup_at at time zone v_tz)::date = p_day
    ) trips
  ), '[]'::jsonb);
end
$$;

create or replace function private.lock_event_for_super_admin()
returns public.events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can export or remove event data' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into v_event from public.events limit 1 for update;
  if not found then
    raise exception 'Set up the event first' using errcode = 'P0002', hint = 'event_not_found';
  end if;
  return v_event;
end
$$;

create or replace function public.regenerate_intake_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.is_admin_plus() then
    raise exception 'Only an Admin or Super Admin can regenerate the intake link'
      using errcode = '42501', hint = 'forbidden';
  end if;

  update public.events set intake_token = private.new_intake_token()
  returning intake_token into v_token;

  if v_token is null then
    raise exception 'Set up the event first' using errcode = 'P0002', hint = 'event_not_found';
  end if;
  return v_token;
end
$$;

create or replace function public.intake_link_context(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'open', e.intake_open,
    'event_name', e.name,
    'venue_name', e.venue_name,
    'timezone', e.timezone,
    'starts_on', e.starts_on,
    'ends_on', e.ends_on
  )
  from public.events e
  where e.intake_token = p_token
$$;

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

create or replace function public.cleaning_queue(p_since timestamptz default null)
returns table (
  task_id uuid,
  room_id uuid,
  room_number text,
  floor smallint,
  wing text,
  room_type text,
  status public.cleaning_status,
  checked_out_at timestamptz,
  estimated_ready_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cleaning_minutes integer,
  buffer_minutes integer,
  needed_by timestamptz,
  problem_kind public.cleaning_problem,
  problem_note text,
  undoable boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.is_coordinator_plus() or private.has_role('housekeeping', 'accommodation')) then
    raise exception 'Only housekeeping, the front desk and coordinators can see the cleaning queue' using errcode = '42501', hint = 'forbidden';
  end if;
  return query
  select t.id, r.id, r.number, r.floor, r.wing, rt.name, t.status, t.checked_out_at, t.estimated_ready_at,
    t.started_at, t.completed_at, rt.cleaning_minutes, e.cleaning_delay_buffer_min,
    (select pg_catalog.min(a.expected_check_in_at) from public.room_assignments a where a.room_id = r.id and a.status = 'planned'),
    t.problem_kind, t.problem_note,
    t.status = 'done' and t.completed_at > pg_catalog.now() - interval '10 minutes'
      and (t.completed_by = private.current_user_id() or private.is_coordinator_plus())
  from public.cleaning_tasks t
  join public.rooms r on r.id = t.room_id
  join public.room_types rt on rt.id = r.room_type_id
  join public.events e on e.id = r.event_id
  where t.status in ('pending', 'in_progress') or (p_since is not null and t.status = 'done' and t.completed_at >= p_since);
end
$$;
-- <<< generated (down)

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

drop function if exists private.event_of_program_item(uuid);
drop function if exists private.event_is_writable(uuid);
drop function if exists private.system_event_id();
drop function if exists private.event_of_driver(uuid);
drop function if exists private.current_event_writable();
drop function if exists private.require_current_event();
drop function if exists private.can_access_event(uuid);
drop function if exists private.works_on_event(uuid, uuid);
