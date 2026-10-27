-- migrate:up
-- Room turnaround and cleaning (P5, FR-CL-01…06): check-out at the front desk (first wins), a
-- cleaning task per vacated room, the housekeeping Start → Done flow, reversing a mistaken
-- check-out, and each room's estimated ready time feeding the allocator's hard rule.

create type public.cleaning_status as enum ('pending', 'in_progress', 'done', 'cancelled');
create type public.cleaning_problem as enum ('maintenance', 'supplies', 'other');

alter table public.room_assignments
  add column checkout_reversed_at timestamptz,
  add column checkout_reversed_by uuid references public.profiles (id);

create table public.cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- The stays whose check-out emptied the room (what a reversal restores).
  stay_ids uuid[] not null default '{}',
  status public.cleaning_status not null default 'pending',
  checked_out_at timestamptz not null,
  -- FR-CL-03 at check-out: checkout + the room type's cleaning minutes + the event's buffer.
  estimated_ready_at timestamptz not null,
  started_at timestamptz,
  started_by uuid references public.profiles (id),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  problem_kind public.cleaning_problem,
  problem_note text check (char_length(problem_note) <= 500),
  problem_reported_at timestamptz,
  problem_reported_by uuid references public.profiles (id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open task per room: a second check-out into a room being turned around joins it.
create unique index cleaning_tasks_one_open on public.cleaning_tasks (room_id) where status in ('pending', 'in_progress');
create index cleaning_tasks_completed_idx on public.cleaning_tasks (completed_at) where status = 'done';

create trigger set_updated_at before update on public.cleaning_tasks
  for each row execute function private.set_updated_at();
create trigger bump_version before update on public.cleaning_tasks
  for each row execute function private.bump_version();
select private.attach_audit('public.cleaning_tasks');
select private.enable_rls('public.cleaning_tasks');

-- Tasks name rooms only, never guests; the stays a task covers stay inside the functions. Writes
-- go through the functions below.
grant select (
  id, event_id, room_id, status, checked_out_at, estimated_ready_at, started_at, started_by, completed_at, completed_by,
  cancelled_at, cancelled_by, problem_kind, problem_note, problem_reported_at, problem_reported_by, version, created_at, updated_at
) on public.cleaning_tasks to vip_app;
create policy cleaning_tasks_select on public.cleaning_tasks for select to vip_app
  using ((select private.is_coordinator_plus()) or (select private.has_role('housekeeping', 'accommodation')));

-- Readiness (FR-CL-03, FR-RA-01) ----------------------------------------------------------------

-- When a room is expected to be clean: null when it is clean now; otherwise the end of its clean,
-- counted from when housekeeping started (or from now, if nobody has started yet).
create function private.room_ready_at(p_room_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.housekeeping_status = 'clean' then null::timestamptz
    else greatest(
      pg_catalog.now(),
      case when t.status = 'in_progress' then t.started_at else pg_catalog.now() end
        + pg_catalog.make_interval(mins => rt.cleaning_minutes + e.cleaning_delay_buffer_min)
    )
  end
  from public.rooms r
  join public.room_types rt on rt.id = r.room_type_id
  join public.events e on e.id = r.event_id
  left join public.cleaning_tasks t on t.room_id = r.id and t.status in ('pending', 'in_progress')
  where r.id = p_room_id
$$;
grant execute on function private.room_ready_at(uuid) to vip_app, vip_system;

-- The P4 hard rule, with "not ready" now judged by the room's expected ready time.
create or replace function private.room_unavailability(
  p_room_id uuid, p_guest_id uuid, p_check_in timestamptz, p_check_out timestamptz, p_ignore uuid default null
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_room record;
  v_turnaround interval;
  v_ready_at timestamptz;
  v_share text;
  v_others integer;
  v_strangers integer;
begin
  select r.out_of_service, r.capacity, rt.cleaning_minutes, e.cleaning_delay_buffer_min
  into v_room
  from public.rooms r
  join public.room_types rt on rt.id = r.room_type_id
  join public.events e on e.id = r.event_id
  where r.id = p_room_id;
  if not found then
    return 'not_found';
  end if;
  if v_room.out_of_service then
    return 'out_of_service';
  end if;
  v_turnaround := pg_catalog.make_interval(mins => v_room.cleaning_minutes + v_room.cleaning_delay_buffer_min);
  v_ready_at := private.room_ready_at(p_room_id);
  if v_ready_at is not null and v_ready_at > p_check_in then
    return 'not_ready';
  end if;
  select g.share_group into v_share from public.guests g where g.id = p_guest_id;
  select count(*), count(*) filter (where v_share is null or g.share_group is distinct from v_share)
  into v_others, v_strangers
  from public.room_assignments a
  join public.guests g on g.id = a.guest_id
  where a.room_id = p_room_id
    and a.status in ('planned', 'checked_in')
    and a.guest_id <> p_guest_id
    and (p_ignore is null or a.id <> p_ignore)
    and pg_catalog.tstzrange(a.expected_check_in_at, a.expected_check_out_at + v_turnaround)
        && pg_catalog.tstzrange(p_check_in, p_check_out + v_turnaround);
  if v_strangers > 0 then
    return 'occupied';
  end if;
  if v_others + 1 > v_room.capacity then
    return 'capacity';
  end if;
  return null;
end
$$;

-- Queueing cleaning (FR-CL-02) ------------------------------------------------------------------

-- Any check-out (the front desk's, or a checked-in guest moved to another room) that leaves the
-- room empty puts it in the cleaning queue and tells housekeeping, by room number only.
create function private.queue_cleaning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id uuid;
  v_room record;
  v_out timestamptz := coalesce(new.checked_out_at, pg_catalog.now());
begin
  if exists (select 1 from public.room_assignments where room_id = new.room_id and status = 'checked_in') then
    return null;
  end if;
  update public.cleaning_tasks set stay_ids = pg_catalog.array_append(stay_ids, new.id)
  where room_id = new.room_id and status in ('pending', 'in_progress')
  returning id into v_task_id;
  if v_task_id is not null then
    return null;
  end if;

  select r.event_id, r.number, rt.cleaning_minutes + e.cleaning_delay_buffer_min as turnaround_min
  into v_room
  from public.rooms r
  join public.room_types rt on rt.id = r.room_type_id
  join public.events e on e.id = r.event_id
  where r.id = new.room_id;
  insert into public.cleaning_tasks (event_id, room_id, stay_ids, checked_out_at, estimated_ready_at)
  values (v_room.event_id, new.room_id, array[new.id], v_out, v_out + pg_catalog.make_interval(mins => v_room.turnaround_min))
  returning id into v_task_id;
  update public.rooms set housekeeping_status = 'needs_cleaning' where id = new.room_id and housekeeping_status = 'clean';
  perform private.notify_roles(
    array['housekeeping']::public.app_role[], 'room_needs_cleaning', 'Room ' || v_room.number || ' needs cleaning',
    null, 'normal', 'cleaning_tasks', v_task_id
  );
  return null;
end
$$;
create trigger queue_cleaning after update of status on public.room_assignments
  for each row when (new.status = 'checked_out' and old.status = 'checked_in')
  execute function private.queue_cleaning();

-- Check-out (FR-CL-01) ------------------------------------------------------------------------

-- Checks out a delegation's checked-in stays at once. The first confirmation wins: a second one is
-- told who did it and when. Lock order guest → room → stay, as everywhere.
create function public.check_out_party(p_delegation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_by text;
  v_at timestamptz;
  v_rooms text[];
begin
  if not (private.is_coordinator_plus() or private.has_role('accommodation')) then
    raise exception 'Only the front desk and coordinators can check guests out' using errcode = '42501', hint = 'forbidden';
  end if;
  perform 1 from public.guests g where g.delegation_id = p_delegation_id order by g.id for update;
  perform 1 from public.rooms r
  where r.id in (
    select a.room_id from public.room_assignments a join public.guests g on g.id = a.guest_id
    where g.delegation_id = p_delegation_id and a.status = 'checked_in'
  )
  order by r.id for update;
  perform 1 from public.room_assignments a join public.guests g on g.id = a.guest_id
  where g.delegation_id = p_delegation_id and a.status in ('checked_in', 'checked_out')
  for update of a;

  if not exists (
    select 1 from public.room_assignments a join public.guests g on g.id = a.guest_id
    where g.delegation_id = p_delegation_id and a.status = 'checked_in'
  ) then
    select p.full_name, a.checked_out_at into v_by, v_at
    from public.room_assignments a
    join public.guests g on g.id = a.guest_id
    left join public.profiles p on p.id = a.checked_out_by
    where g.delegation_id = p_delegation_id and a.status = 'checked_out'
    order by a.checked_out_at desc nulls last limit 1;
    if v_at is not null then
      raise exception 'Already checked out' using errcode = '55000', hint = 'already_checked_out',
        detail = pg_catalog.jsonb_build_object('by', coalesce(v_by, 'someone'), 'at', v_at)::text;
    end if;
    raise exception 'Nobody in this party is checked in' using errcode = 'P0002', hint = 'not_found';
  end if;

  perform private.set_audit_context(p_action => 'rooms.check_out');
  with checked_out as (
    update public.room_assignments a
    set status = 'checked_out', checked_out_at = pg_catalog.now(), checked_out_by = private.current_user_id()
    from public.guests g
    where g.id = a.guest_id and g.delegation_id = p_delegation_id and a.status = 'checked_in'
    returning a.guest_id, a.room_id
  ), guests_out as (
    update public.guests g set status = 'checked_out'
    from checked_out where g.id = checked_out.guest_id and g.status = 'checked_in'
    returning g.id
  )
  select pg_catalog.array_agg(distinct r.number order by r.number) into v_rooms
  from checked_out join public.rooms r on r.id = checked_out.room_id;
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('delegation_id', p_delegation_id, 'rooms', pg_catalog.to_jsonb(v_rooms));
end
$$;

-- Reverses a mistaken check-out while its cleaning has not started (FR-CL-06): the stays and guests
-- are checked in again, the room is clean again and the task is cancelled. Coordinators only.
create function public.reverse_checkout(p_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task public.cleaning_tasks;
  v_stays uuid[];
  v_number text;
  v_count integer;
begin
  if not private.is_coordinator_plus() then
    raise exception 'Only coordinators can reverse a check-out' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into v_task from public.cleaning_tasks where id = p_task_id;
  if not found then
    raise exception 'Cleaning task not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_stays := v_task.stay_ids;
  perform 1 from public.guests g
  where g.id in (select a.guest_id from public.room_assignments a where a.id = any (v_task.stay_ids))
  order by g.id for update;
  select r.number into v_number from public.rooms r where r.id = v_task.room_id for update;
  perform 1 from public.room_assignments a where a.id = any (v_task.stay_ids) for update;
  select * into v_task from public.cleaning_tasks where id = p_task_id for update;
  -- The stays were locked from the first read; a check-out joining the task since means try again.
  if v_task.stay_ids is distinct from v_stays then
    raise exception 'The room changed while reversing; try again' using errcode = '55000', hint = 'changed';
  end if;

  if v_task.status = 'cancelled' then
    raise exception 'This check-out was already reversed' using errcode = '55000', hint = 'already_reversed';
  end if;
  if v_task.status <> 'pending' then
    raise exception 'Housekeeping has already started on this room' using errcode = '55000', hint = 'cleaning_started';
  end if;
  -- One party's mistake must not check another party back in.
  if (
    select count(distinct g.delegation_id) from public.room_assignments a join public.guests g on g.id = a.guest_id
    where a.id = any (v_task.stay_ids)
  ) > 1 then
    raise exception 'Several parties left this room, so this check-out cannot be reversed here' using errcode = '55000', hint = 'shared_room';
  end if;
  -- A guest moved to another room continues there; that move is not undone here.
  if exists (select 1 from public.room_assignments a where a.moved_from_id = any (v_task.stay_ids)) then
    raise exception 'The guest was moved to another room' using errcode = '55000', hint = 'moved';
  end if;
  if exists (
    select 1 from public.room_assignments a
    join public.room_assignments s on s.guest_id = a.guest_id and s.id = any (v_task.stay_ids)
    where a.status in ('planned', 'checked_in')
  ) then
    raise exception 'A guest from this room already has another room' using errcode = '55000', hint = 'guest_has_room';
  end if;

  perform private.set_audit_context(p_action => 'rooms.reverse_checkout');
  with restored as (
    update public.room_assignments a
    set status = 'checked_in', checked_out_at = null, checked_out_by = null,
        checkout_reversed_at = pg_catalog.now(), checkout_reversed_by = private.current_user_id()
    where a.id = any (v_task.stay_ids) and a.status = 'checked_out'
    returning a.guest_id
  ), guests_back as (
    update public.guests g set status = 'checked_in'
    from restored where g.id = restored.guest_id and g.status = 'checked_out'
    returning g.id
  )
  select count(*) into v_count from restored;
  update public.cleaning_tasks
  set status = 'cancelled', cancelled_at = pg_catalog.now(), cancelled_by = private.current_user_id()
  where id = p_task_id;
  update public.rooms set housekeeping_status = 'clean' where id = v_task.room_id;
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('task_id', p_task_id, 'room_number', v_number, 'restored', v_count);
end
$$;

-- Housekeeping (FR-CL-04/05) --------------------------------------------------------------------

-- The cleaning list without guest identities: open tasks, plus tasks done since `p_since`, with
-- the next planned arrival into each room ("needed by"). Ordering is done by the app (pure code).
create function public.cleaning_queue(p_since timestamptz default null)
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

-- Locks the task's room, then the task (room → task), after checking who may act.
create function private.lock_cleaning_task(p_task_id uuid)
returns public.cleaning_tasks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_task public.cleaning_tasks;
begin
  if not (private.is_coordinator_plus() or private.has_role('housekeeping')) then
    raise exception 'Only housekeeping and coordinators can update cleaning' using errcode = '42501', hint = 'forbidden';
  end if;
  select room_id into v_room_id from public.cleaning_tasks where id = p_task_id;
  if not found then
    raise exception 'Cleaning task not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform 1 from public.rooms where id = v_room_id for update;
  select * into v_task from public.cleaning_tasks where id = p_task_id for update;
  if v_task.status = 'cancelled' then
    raise exception 'This check-out was reversed; the room does not need cleaning' using errcode = '55000', hint = 'cancelled';
  end if;
  return v_task;
end
$$;

create function public.start_cleaning(p_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task public.cleaning_tasks := private.lock_cleaning_task(p_task_id);
  v_by text;
begin
  if v_task.status = 'in_progress' then
    select p.full_name into v_by from public.profiles p where p.id = v_task.started_by;
    raise exception 'Cleaning has already started' using errcode = '55000', hint = 'already_started',
      detail = pg_catalog.jsonb_build_object('by', coalesce(v_by, 'someone'), 'at', v_task.started_at)::text;
  end if;
  if v_task.status = 'done' then
    raise exception 'This room is already clean' using errcode = '55000', hint = 'already_done';
  end if;
  perform private.set_audit_context(p_action => 'cleaning.start');
  update public.cleaning_tasks
  set status = 'in_progress', started_at = pg_catalog.now(), started_by = private.current_user_id()
  where id = p_task_id;
  update public.rooms set housekeeping_status = 'cleaning' where id = v_task.room_id;
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('task_id', p_task_id, 'status', 'in_progress');
end
$$;

-- Done sets the room to clean and tells the front desk it can be checked into.
create function public.complete_cleaning(p_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task public.cleaning_tasks := private.lock_cleaning_task(p_task_id);
  v_number text;
begin
  if v_task.status = 'pending' then
    raise exception 'Start cleaning before marking the room ready' using errcode = '55000', hint = 'not_started';
  end if;
  if v_task.status = 'done' then
    raise exception 'This room is already clean' using errcode = '55000', hint = 'already_done';
  end if;
  perform private.set_audit_context(p_action => 'cleaning.complete');
  update public.cleaning_tasks
  set status = 'done', completed_at = pg_catalog.now(), completed_by = private.current_user_id()
  where id = p_task_id;
  update public.rooms set housekeeping_status = 'clean' where id = v_task.room_id returning number into v_number;
  perform private.notify_roles(
    array['accommodation']::public.app_role[], 'room_ready', 'Room ' || v_number || ' is ready', null, 'normal', 'cleaning_tasks', p_task_id
  );
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('task_id', p_task_id, 'status', 'done');
end
$$;

-- "Undo" right after a mistaken "Mark ready": within ten minutes, by whoever did it or a
-- coordinator, and only while nobody has been checked into the room since.
create function public.undo_complete_cleaning(p_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task public.cleaning_tasks := private.lock_cleaning_task(p_task_id);
begin
  if v_task.status <> 'done' or v_task.completed_at <= pg_catalog.now() - interval '10 minutes'
     or not (v_task.completed_by = private.current_user_id() or private.is_coordinator_plus()) then
    raise exception 'There is no recent "ready" to undo' using errcode = '55000', hint = 'nothing_to_undo';
  end if;
  -- Checked in since, or checked in and out again (a newer task is open for the room).
  if exists (select 1 from public.room_assignments a where a.room_id = v_task.room_id and a.status = 'checked_in')
     or exists (select 1 from public.cleaning_tasks t where t.room_id = v_task.room_id and t.id <> p_task_id and t.status in ('pending', 'in_progress')) then
    raise exception 'The room has been used since it was marked ready' using errcode = '55000', hint = 'room_in_use';
  end if;
  perform private.set_audit_context(p_action => 'cleaning.undo_complete');
  update public.cleaning_tasks set status = 'in_progress', completed_at = null, completed_by = null where id = p_task_id;
  update public.rooms set housekeeping_status = 'cleaning' where id = v_task.room_id;
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('task_id', p_task_id, 'status', 'in_progress');
end
$$;

-- Figma "Report a problem": kept on the task (so it is audited) and sent to the coordinators.
create function public.report_cleaning_problem(p_task_id uuid, p_kind public.cleaning_problem, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task public.cleaning_tasks := private.lock_cleaning_task(p_task_id);
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_number text;
begin
  if v_task.status = 'done' then
    raise exception 'This room is already clean' using errcode = '55000', hint = 'already_done';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 500 then
    raise exception 'The note is too long' using errcode = '22023', hint = 'invalid';
  end if;
  perform private.set_audit_context(p_action => 'cleaning.report_problem');
  update public.cleaning_tasks
  set problem_kind = p_kind, problem_note = v_note, problem_reported_at = pg_catalog.now(), problem_reported_by = private.current_user_id()
  where id = p_task_id;
  select r.number into v_number from public.rooms r where r.id = v_task.room_id;
  perform private.notify_roles(
    array['super_admin', 'admin', 'coordinator']::public.app_role[], 'cleaning_problem',
    'Room ' || v_number || ': ' || case p_kind when 'maintenance' then 'maintenance needed' when 'supplies' then 'missing supplies' else 'a problem was reported' end,
    v_note, 'normal', 'cleaning_tasks', p_task_id
  );
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('task_id', p_task_id, 'problem_kind', p_kind);
end
$$;

grant execute on function public.check_out_party(uuid) to vip_app;
grant execute on function public.reverse_checkout(uuid) to vip_app;
grant execute on function public.cleaning_queue(timestamptz) to vip_app;
grant execute on function public.start_cleaning(uuid) to vip_app;
grant execute on function public.complete_cleaning(uuid) to vip_app;
grant execute on function public.undo_complete_cleaning(uuid) to vip_app;
grant execute on function public.report_cleaning_problem(uuid, public.cleaning_problem, text) to vip_app;

-- migrate:down
drop function if exists public.report_cleaning_problem(uuid, public.cleaning_problem, text);
drop function if exists public.undo_complete_cleaning(uuid);
drop function if exists public.complete_cleaning(uuid);
drop function if exists public.start_cleaning(uuid);
drop function if exists private.lock_cleaning_task(uuid);
drop function if exists public.cleaning_queue(timestamptz);
drop function if exists public.reverse_checkout(uuid);
drop function if exists public.check_out_party(uuid);
drop trigger if exists queue_cleaning on public.room_assignments;
drop function if exists private.queue_cleaning();

-- room_unavailability returns to its P4 form (not ready = not clean and cannot be cleaned from now).
create or replace function private.room_unavailability(
  p_room_id uuid, p_guest_id uuid, p_check_in timestamptz, p_check_out timestamptz, p_ignore uuid default null
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_room record;
  v_turnaround interval;
  v_share text;
  v_others integer;
  v_strangers integer;
begin
  select r.out_of_service, r.capacity, r.housekeeping_status, rt.cleaning_minutes, e.cleaning_delay_buffer_min
  into v_room
  from public.rooms r
  join public.room_types rt on rt.id = r.room_type_id
  join public.events e on e.id = r.event_id
  where r.id = p_room_id;
  if not found then
    return 'not_found';
  end if;
  if v_room.out_of_service then
    return 'out_of_service';
  end if;
  v_turnaround := pg_catalog.make_interval(mins => v_room.cleaning_minutes + v_room.cleaning_delay_buffer_min);
  if v_room.housekeeping_status <> 'clean' and pg_catalog.now() + v_turnaround > p_check_in then
    return 'not_ready';
  end if;
  select g.share_group into v_share from public.guests g where g.id = p_guest_id;
  select count(*), count(*) filter (where v_share is null or g.share_group is distinct from v_share)
  into v_others, v_strangers
  from public.room_assignments a
  join public.guests g on g.id = a.guest_id
  where a.room_id = p_room_id
    and a.status in ('planned', 'checked_in')
    and a.guest_id <> p_guest_id
    and (p_ignore is null or a.id <> p_ignore)
    and pg_catalog.tstzrange(a.expected_check_in_at, a.expected_check_out_at + v_turnaround)
        && pg_catalog.tstzrange(p_check_in, p_check_out + v_turnaround);
  if v_strangers > 0 then
    return 'occupied';
  end if;
  if v_others + 1 > v_room.capacity then
    return 'capacity';
  end if;
  return null;
end
$$;

drop function if exists private.room_ready_at(uuid);
drop table if exists public.cleaning_tasks;
alter table public.room_assignments drop column if exists checkout_reversed_by, drop column if exists checkout_reversed_at;
drop type if exists public.cleaning_problem;
drop type if exists public.cleaning_status;
