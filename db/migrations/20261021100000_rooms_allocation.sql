-- migrate:up
-- Room allocation (P4, FR-RA-01…09): stays in rooms (room_assignments), the hard-rule check shared
-- by plan approval, manual moves and the allocator's dry runs, plan approval with chosen lines,
-- manual assignment with "assign anyway", and check-in at the front desk.

create type public.stay_status as enum ('planned', 'checked_in', 'checked_out', 'cancelled');

create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  room_id uuid not null references public.rooms (id),
  guest_id uuid not null references public.guests (id) on delete cascade,
  expected_check_in_at timestamptz not null,
  expected_check_out_at timestamptz not null,
  status public.stay_status not null default 'planned',
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id),
  checked_out_at timestamptz,
  checked_out_by uuid references public.profiles (id),
  proposal_id uuid references public.proposals (id) on delete set null,
  -- Placed by hand although it broke a rule (FR-RA-06): which ones, and why.
  is_manual_override boolean not null default false,
  override_reason text check (char_length(override_reason) <= 1000),
  acknowledged_violations text[] not null default '{}',
  -- Set when a checked-in guest was moved: this stay continues that one (it cannot be "undone").
  moved_from_id uuid references public.room_assignments (id),
  created_by uuid references public.profiles (id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_assignments_window check (expected_check_out_at > expected_check_in_at)
);
-- One current stay per guest.
create unique index room_assignments_one_active on public.room_assignments (guest_id)
  where status in ('planned', 'checked_in');
create index room_assignments_room_idx on public.room_assignments (room_id, expected_check_in_at)
  where status in ('planned', 'checked_in');

create trigger set_updated_at before update on public.room_assignments
  for each row execute function private.set_updated_at();
create trigger bump_version before update on public.room_assignments
  for each row execute function private.bump_version();
select private.attach_audit('public.room_assignments');
select private.enable_rls('public.room_assignments');

-- Coordinators and the front desk read stays; housekeeping never sees who is in a room (P5 view).
-- Writes go through approve_proposal, assign_room and the check-in functions only.
grant select on public.room_assignments to vip_app;
create policy room_assignments_select on public.room_assignments for select to vip_app
  using ((select private.is_coordinator_plus()) or (select private.has_role('accommodation')));

-- The front desk shows each party's VIP category (Figma "Front desk"); category names are not sensitive.
drop policy vip_categories_select on public.vip_categories;
create policy vip_categories_select on public.vip_categories for select to vip_app
  using ((select private.has_role('super_admin', 'admin', 'coordinator', 'programs', 'accommodation')));

-- Hard rules (FR-RA-01) ----------------------------------------------------------------------

-- A guest's stay: from when they are expected at the venue to their departure (defaults: midday
-- on the first and last event days). Invoker rights: callers see only what their role may read.
create function private.guest_stay_window(p_guest_id uuid)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  with stay as (
    select
      coalesce(
        a.expected_at_venue_at, a.stated_arrival_at, a.requested_pickup_at,
        (e.starts_on + time '12:00') at time zone e.timezone
      ) as check_in,
      coalesce(g.expected_departure_at, (e.ends_on + time '12:00') at time zone e.timezone) as check_out
    from public.guests g
    join public.events e on e.id = g.event_id
    left join public.arrivals a on a.id = g.arrival_id
    where g.id = p_guest_id
  )
  select pg_catalog.tstzrange(
    check_in,
    case when check_out > check_in then check_out else check_in + interval '1 day' end
  )
  from stay
$$;

-- Why a guest cannot have a room for a stay, or null when every hard rule holds:
--   out_of_service · not_ready (not clean and cannot be cleaned before arrival) · occupied
--   (another room group overlaps, counting the cleaning time after each stay) · capacity.
-- Guests of the same room-share group may share; nobody else does (FR-RA-03).
create function private.room_unavailability(
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

grant execute on function private.guest_stay_window(uuid) to vip_app, vip_system;
grant execute on function private.room_unavailability(uuid, uuid, timestamptz, timestamptz, uuid) to vip_app, vip_system;

-- A cancelled guest's planned stay is released at once (FR-RA-07), so the room is free again.
create function private.release_cancelled_stays()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_assignments set status = 'cancelled' where guest_id = new.id and status = 'planned';
  return null;
end
$$;
create trigger release_cancelled_stays after update of status on public.guests
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function private.release_cancelled_stays();

-- Executing room proposals ---------------------------------------------------------------------

-- room_assignment, payload {guest_id, room_id, replaces?} (+ check_in/check_out for display):
-- places the guest if every hard rule still holds for the guest's stay window as it is now — an
-- arrival may have moved since the suggestion was made. `replaces` is the guest's current stay
-- when the proposal moves them (FR-RA-07); otherwise the guest must not have a room yet.
-- Locks are always taken guest → room → stay (here, in assign_room and in check_in_party), so
-- concurrent approvals, moves and check-ins cannot deadlock.
create function private.execute_room_assignment(p_proposal public.proposals)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guest_id uuid;
  v_room_id uuid;
  v_window tstzrange;
  v_replaces uuid;
  v_guest_status public.guest_status;
  v_current public.room_assignments;
  v_reason text;
begin
  begin
    v_guest_id := (p_proposal.payload ->> 'guest_id')::uuid;
    v_room_id := (p_proposal.payload ->> 'room_id')::uuid;
    v_replaces := nullif(p_proposal.payload ->> 'replaces', '')::uuid;
  exception when invalid_text_representation then
    return pg_catalog.jsonb_build_object('error', 'invalid_payload');
  end;
  if v_guest_id is null or v_room_id is null then
    return pg_catalog.jsonb_build_object('error', 'invalid_payload');
  end if;

  select g.status into v_guest_status from public.guests g where g.id = v_guest_id for update;
  if not found or v_guest_status in ('cancelled', 'checked_out') then
    return pg_catalog.jsonb_build_object('error', 'guest_gone');
  end if;
  -- One placement in a room at a time, so two approvals cannot both take its last bed.
  perform 1 from public.rooms where id = v_room_id for update;
  v_window := private.guest_stay_window(v_guest_id);
  select * into v_current from public.room_assignments
  where guest_id = v_guest_id and status in ('planned', 'checked_in') for update;
  if v_current.id is not null then
    if v_current.status = 'checked_in' then
      return pg_catalog.jsonb_build_object('error', 'checked_in');
    end if;
    if v_replaces is null or v_current.id <> v_replaces then
      return pg_catalog.jsonb_build_object('error', 'already_placed');
    end if;
  end if;

  v_reason := private.room_unavailability(v_room_id, v_guest_id, pg_catalog.lower(v_window), pg_catalog.upper(v_window), v_current.id);
  if v_reason is not null then
    return pg_catalog.jsonb_build_object('error', 'room_' || v_reason);
  end if;

  if v_current.id is not null then
    update public.room_assignments set status = 'cancelled' where id = v_current.id;
  end if;
  insert into public.room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, proposal_id, created_by)
  values (v_room_id, v_guest_id, pg_catalog.lower(v_window), pg_catalog.upper(v_window), p_proposal.id, private.current_user_id());
  return pg_catalog.jsonb_build_object('guest_id', v_guest_id, 'room_id', v_room_id);
end
$$;

-- room_plan: executes the chosen lines (all pending lines when none are named), in order; each
-- line is approved or marked failed with its reason, and lines not chosen are rejected.
create function private.execute_room_plan(p_plan public.proposals, p_line_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_line public.proposals;
  v_result jsonb;
  v_applied integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if p_line_ids is not null and exists (
    select 1 from pg_catalog.unnest(p_line_ids) as l(id)
    where not exists (select 1 from public.proposals p where p.id = l.id and p.parent_id = p_plan.id)
  ) then
    raise exception 'A chosen line does not belong to this plan' using errcode = '22023', hint = 'invalid_line';
  end if;

  for v_line in
    select * from public.proposals
    where parent_id = p_plan.id and status = 'pending' and (p_line_ids is null or id = any (p_line_ids))
    order by created_at, id
    for update
  loop
    v_result := private.execute_room_assignment(v_line);
    if v_result ? 'error' then
      update public.proposals
      set status = 'failed', decided_at = pg_catalog.now(), decided_by = private.current_user_id(),
          execution_error = v_result ->> 'error'
      where id = v_line.id;
      v_errors := v_errors || pg_catalog.jsonb_build_object('line_id', v_line.id, 'error', v_result ->> 'error');
    else
      update public.proposals
      set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
      where id = v_line.id;
      v_applied := v_applied + 1;
    end if;
  end loop;

  update public.proposals
  set status = 'rejected', decided_at = pg_catalog.now(), decided_by = private.current_user_id(),
      decision_note = 'Not chosen when the plan was approved'
  where parent_id = p_plan.id and status = 'pending';
  return pg_catalog.jsonb_build_object('applied', v_applied, 'failed', pg_catalog.jsonb_array_length(v_errors), 'errors', v_errors);
end
$$;

-- Approval now also executes room plans (with chosen lines) and single room proposals. Lines are
-- decided through their plan. Co-Pilot actions (P7) still answer 501.
create or replace function public.approve_proposal(p_proposal_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
  v_result jsonb;
begin
  v_proposal := private.lock_pending_proposal(p_proposal_id);

  if v_proposal.parent_id is not null then
    raise exception 'Decide this line through its plan' using errcode = '55000', hint = 'is_line';
  end if;

  if v_proposal.expires_at is not null and v_proposal.expires_at <= pg_catalog.now() then
    perform private.set_audit_context(p_action => 'proposals.expire');
    update public.proposals
    set status = 'expired', decided_at = pg_catalog.now()
    where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'expired');
  end if;

  if v_proposal.kind = 'copilot_action' then
    raise exception 'Approving % proposals is not available yet', v_proposal.kind
      using errcode = '0A000', hint = 'not_implemented';
  end if;

  perform private.set_audit_context(p_action => 'proposals.execute', p_proposal_id => p_proposal_id);
  if v_proposal.kind = 'room_plan' then
    v_result := private.execute_room_plan(v_proposal, p_line_ids);
    perform private.set_audit_context(p_action => 'proposals.approve', p_proposal_id => p_proposal_id);
    update public.proposals
    set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
    where id = p_proposal_id;
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'approved') || v_result;
  end if;

  v_result := case
    when v_proposal.kind = 'release_pickup' then private.execute_release_pickup(v_proposal)
    when v_proposal.kind = 'room_assignment' then private.execute_room_assignment(v_proposal)
    else private.execute_driver_proposal(v_proposal)
  end;

  if v_result ? 'error' then
    perform private.set_audit_context(p_action => 'proposals.fail', p_proposal_id => p_proposal_id);
    update public.proposals
    set status = 'failed', decided_at = pg_catalog.now(), decided_by = private.current_user_id(),
        execution_error = v_result ->> 'error'
    where id = p_proposal_id;
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'failed', 'error', v_result ->> 'error');
  end if;

  perform private.set_audit_context(p_action => 'proposals.approve', p_proposal_id => p_proposal_id);
  update public.proposals
  set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
  where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'approved') || v_result;
end
$$;

-- Manual assignment (FR-RA-06) -----------------------------------------------------------------

-- Places or moves a guest by hand. A move that breaks a hard rule (or moves a checked-in guest)
-- needs a reason of at least 10 characters and the coordinator's acknowledgement of every broken
-- rule (sent by the warning dialog); it is then kept as an override with that reason.
create function public.assign_room(
  p_guest_id uuid, p_room_id uuid, p_reason text default null, p_acknowledged text[] default '{}'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guest_status public.guest_status;
  v_window tstzrange;
  v_current public.room_assignments;
  v_violations text[] := '{}';
  v_reason text;
  v_reason_text text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_new_id uuid;
  v_number text;
  v_name text;
begin
  if not private.is_coordinator_plus() then
    raise exception 'Only coordinators can assign rooms' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_reason_text is not null and pg_catalog.char_length(v_reason_text) > 1000 then
    raise exception 'The reason is too long' using errcode = '22023', hint = 'invalid';
  end if;
  select g.status into v_guest_status from public.guests g where g.id = p_guest_id for update;
  if not found then
    raise exception 'Guest not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_guest_status in ('cancelled', 'checked_out') then
    raise exception 'This guest is no longer expected' using errcode = '55000', hint = 'guest_gone';
  end if;
  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_window := private.guest_stay_window(p_guest_id);
  select * into v_current from public.room_assignments
  where guest_id = p_guest_id and status in ('planned', 'checked_in') for update;
  if v_current.room_id = p_room_id then
    raise exception 'The guest is already in this room' using errcode = '55000', hint = 'same_room';
  end if;

  v_reason := private.room_unavailability(p_room_id, p_guest_id, pg_catalog.lower(v_window), pg_catalog.upper(v_window), v_current.id);
  if v_reason is not null then
    v_violations := pg_catalog.array_append(v_violations, v_reason);
  end if;
  if v_current.status = 'checked_in' then
    v_violations := pg_catalog.array_append(v_violations, 'checked_in');
  end if;
  if pg_catalog.cardinality(v_violations) > 0 and (
    v_reason_text is null or pg_catalog.char_length(v_reason_text) < 10 or not (v_violations <@ coalesce(p_acknowledged, '{}'))
  ) then
    raise exception 'This assignment breaks a rule' using errcode = '55000', hint = 'needs_confirmation',
      detail = pg_catalog.jsonb_build_object('violations', pg_catalog.to_jsonb(v_violations))::text;
  end if;

  perform private.set_audit_context(p_action => 'rooms.assign', p_reason => v_reason_text);
  if v_current.id is not null and v_current.status = 'checked_in' then
    -- Moved during the stay: the old room is vacated now, the new stay starts checked in.
    update public.room_assignments
    set status = 'checked_out', checked_out_at = pg_catalog.now(), checked_out_by = private.current_user_id()
    where id = v_current.id;
  elsif v_current.id is not null then
    update public.room_assignments set status = 'cancelled' where id = v_current.id;
  end if;
  insert into public.room_assignments (
    room_id, guest_id, expected_check_in_at, expected_check_out_at, status, checked_in_at, checked_in_by,
    is_manual_override, override_reason, acknowledged_violations, moved_from_id, created_by
  )
  values (
    p_room_id, p_guest_id,
    case when v_current.status = 'checked_in' then pg_catalog.now() else pg_catalog.lower(v_window) end,
    pg_catalog.upper(v_window),
    case when v_current.status = 'checked_in' then 'checked_in'::public.stay_status else 'planned'::public.stay_status end,
    case when v_current.status = 'checked_in' then pg_catalog.now() end,
    case when v_current.status = 'checked_in' then private.current_user_id() end,
    pg_catalog.cardinality(v_violations) > 0, v_reason_text, v_violations,
    case when v_current.status = 'checked_in' then v_current.id end,
    private.current_user_id()
  )
  returning id into v_new_id;

  select r.number into v_number from public.rooms r where r.id = p_room_id;
  select pg_catalog.concat_ws(' ', g.title, g.full_name) into v_name from public.guests g where g.id = p_guest_id;
  -- The front desk hears about the move, not the coordinator's reason (that stays in Activity).
  if v_current.id is not null then
    perform private.notify_roles(
      array['accommodation']::public.app_role[], 'room_changed',
      coalesce(nullif(v_name, ''), 'A guest') || ' moved to room ' || v_number, null, 'normal', 'guests', p_guest_id
    );
  end if;
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('assignment_id', v_new_id, 'room_number', v_number, 'violations', pg_catalog.to_jsonb(v_violations));
end
$$;

-- Front desk (FR-RA-09) ------------------------------------------------------------------------

-- Checks in a delegation's planned stays at once (the party arrives together). The first
-- confirmation wins: a second one is told who did it and when. A room that is not ready yet, or
-- that someone outside the party is still checked into, cannot be checked into.
create function public.check_in_party(p_delegation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows integer;
  v_by text;
  v_at timestamptz;
  v_not_ready text[];
  v_occupied text[];
  v_rooms text[];
begin
  if not (private.is_coordinator_plus() or private.has_role('accommodation')) then
    raise exception 'Only the front desk and coordinators can check guests in' using errcode = '42501', hint = 'forbidden';
  end if;
  -- Guest → room → stay, the lock order used everywhere; rooms are share-locked so housekeeping
  -- cannot change a room's readiness while it is being checked.
  perform 1 from public.guests g where g.delegation_id = p_delegation_id order by g.id for update;
  perform 1 from public.rooms r
  where r.id in (
    select a.room_id from public.room_assignments a join public.guests g on g.id = a.guest_id
    where g.delegation_id = p_delegation_id and a.status = 'planned'
  )
  order by r.id for share;
  perform 1 from public.room_assignments a join public.guests g on g.id = a.guest_id
  where g.delegation_id = p_delegation_id and a.status in ('planned', 'checked_in')
  for update of a;

  select count(*) into v_rows from public.room_assignments a join public.guests g on g.id = a.guest_id
  where g.delegation_id = p_delegation_id and a.status = 'planned';
  if v_rows = 0 then
    select p.full_name, a.checked_in_at into v_by, v_at
    from public.room_assignments a
    join public.guests g on g.id = a.guest_id
    left join public.profiles p on p.id = a.checked_in_by
    where g.delegation_id = p_delegation_id and a.status = 'checked_in'
    order by a.checked_in_at desc limit 1;
    if v_at is not null then
      raise exception 'Already checked in' using errcode = '55000', hint = 'already_checked_in',
        detail = pg_catalog.jsonb_build_object('by', coalesce(v_by, 'someone'), 'at', v_at)::text;
    end if;
    raise exception 'No room is planned for this party' using errcode = 'P0002', hint = 'not_found';
  end if;

  select pg_catalog.array_agg(distinct r.number order by r.number) into v_not_ready
  from public.room_assignments a
  join public.guests g on g.id = a.guest_id
  join public.rooms r on r.id = a.room_id
  where g.delegation_id = p_delegation_id and a.status = 'planned'
    and (r.out_of_service or r.housekeeping_status <> 'clean');
  if v_not_ready is not null then
    raise exception 'A room is not ready yet' using errcode = '55000', hint = 'room_not_ready',
      detail = pg_catalog.jsonb_build_object('rooms', pg_catalog.to_jsonb(v_not_ready))::text;
  end if;

  -- A late departure or a moved arrival can leave someone else still in the room (FR-RA-01).
  select pg_catalog.array_agg(distinct r.number order by r.number) into v_occupied
  from public.room_assignments a
  join public.guests g on g.id = a.guest_id
  join public.rooms r on r.id = a.room_id
  where g.delegation_id = p_delegation_id and a.status = 'planned'
    and exists (
      select 1 from public.room_assignments o join public.guests og on og.id = o.guest_id
      where o.room_id = a.room_id and o.status = 'checked_in' and og.delegation_id <> p_delegation_id
        and (g.share_group is null or og.share_group is distinct from g.share_group)
    );
  if v_occupied is not null then
    raise exception 'Someone else is still checked into a room' using errcode = '55000', hint = 'room_occupied',
      detail = pg_catalog.jsonb_build_object('rooms', pg_catalog.to_jsonb(v_occupied))::text;
  end if;

  perform private.set_audit_context(p_action => 'rooms.check_in');
  with checked as (
    update public.room_assignments a
    set status = 'checked_in', checked_in_at = pg_catalog.now(), checked_in_by = private.current_user_id()
    from public.guests g
    where g.id = a.guest_id and g.delegation_id = p_delegation_id and a.status = 'planned'
      and g.status not in ('cancelled', 'checked_out')
    returning a.guest_id, a.room_id
  ), guests_in as (
    update public.guests g set status = 'checked_in'
    from checked where g.id = checked.guest_id and g.status in ('expected', 'arrived')
    returning g.id
  )
  select pg_catalog.array_agg(distinct r.number order by r.number) into v_rooms
  from checked join public.rooms r on r.id = checked.room_id;
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('delegation_id', p_delegation_id, 'rooms', pg_catalog.to_jsonb(v_rooms));
end
$$;

-- "Undo" right after a mistaken check-in: within ten minutes, by whoever did it or a coordinator.
-- A stay that continues a checked-in guest's move is not a check-in and is never undone here.
create function public.undo_check_in(p_delegation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (private.is_coordinator_plus() or private.has_role('accommodation')) then
    raise exception 'Only the front desk and coordinators can undo a check-in' using errcode = '42501', hint = 'forbidden';
  end if;
  perform private.set_audit_context(p_action => 'rooms.undo_check_in');
  with undone as (
    update public.room_assignments a
    set status = 'planned', checked_in_at = null, checked_in_by = null
    from public.guests g
    where g.id = a.guest_id and g.delegation_id = p_delegation_id and a.status = 'checked_in'
      and a.moved_from_id is null
      and a.checked_in_at > pg_catalog.now() - interval '10 minutes'
      and (a.checked_in_by = private.current_user_id() or private.is_coordinator_plus())
    returning a.guest_id
  ), guests_back as (
    update public.guests g
    set status = case when ar.status = 'arrived' then 'arrived'::public.guest_status else 'expected'::public.guest_status end
    from undone
    join public.guests g2 on g2.id = undone.guest_id
    left join public.arrivals ar on ar.id = g2.arrival_id
    where g.id = undone.guest_id and g.status = 'checked_in'
    returning g.id
  )
  select count(*) into v_count from undone;
  perform private.clear_audit_context();
  if v_count = 0 then
    raise exception 'There is no recent check-in to undo' using errcode = '55000', hint = 'nothing_to_undo';
  end if;
  return pg_catalog.jsonb_build_object('delegation_id', p_delegation_id, 'undone', v_count);
end
$$;

grant execute on function public.assign_room(uuid, uuid, text, text[]) to vip_app;
grant execute on function public.check_in_party(uuid) to vip_app;
grant execute on function public.undo_check_in(uuid) to vip_app;

-- migrate:down
-- approve_proposal returns to its P3 form (driver executors only).
create or replace function public.approve_proposal(p_proposal_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
  v_result jsonb;
begin
  v_proposal := private.lock_pending_proposal(p_proposal_id);

  if v_proposal.expires_at is not null and v_proposal.expires_at <= pg_catalog.now() then
    perform private.set_audit_context(p_action => 'proposals.expire');
    update public.proposals
    set status = 'expired', decided_at = pg_catalog.now()
    where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'expired');
  end if;

  if v_proposal.kind not in ('driver_assignment', 'driver_reassignment', 'release_pickup') then
    raise exception 'Approving % proposals is not available yet', v_proposal.kind
      using errcode = '0A000', hint = 'not_implemented';
  end if;

  perform private.set_audit_context(p_action => 'proposals.execute', p_proposal_id => p_proposal_id);
  v_result := case
    when v_proposal.kind = 'release_pickup' then private.execute_release_pickup(v_proposal)
    else private.execute_driver_proposal(v_proposal)
  end;

  if v_result ? 'error' then
    perform private.set_audit_context(p_action => 'proposals.fail', p_proposal_id => p_proposal_id);
    update public.proposals
    set status = 'failed', decided_at = pg_catalog.now(), decided_by = private.current_user_id(),
        execution_error = v_result ->> 'error'
    where id = p_proposal_id;
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'failed', 'error', v_result ->> 'error');
  end if;

  perform private.set_audit_context(p_action => 'proposals.approve', p_proposal_id => p_proposal_id);
  update public.proposals
  set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
  where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'approved') || v_result;
end
$$;

drop policy vip_categories_select on public.vip_categories;
create policy vip_categories_select on public.vip_categories for select to vip_app
  using ((select private.has_role('super_admin', 'admin', 'coordinator', 'programs')));

drop trigger if exists release_cancelled_stays on public.guests;
drop function if exists private.release_cancelled_stays();
drop function if exists public.undo_check_in(uuid);
drop function if exists public.check_in_party(uuid);
drop function if exists public.assign_room(uuid, uuid, text, text[]);
drop function if exists private.execute_room_plan(public.proposals, uuid[]);
drop function if exists private.execute_room_assignment(public.proposals);
drop function if exists private.room_unavailability(uuid, uuid, timestamptz, timestamptz, uuid);
drop function if exists private.guest_stay_window(uuid);
drop table if exists public.room_assignments;
drop type if exists public.stay_status;
