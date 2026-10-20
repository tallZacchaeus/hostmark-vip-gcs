-- migrate:up
-- Flights and transport (P3, FR-FT-01…11): the flight update history, driver assignments,
-- simulation runs and provider usage; driver feasibility checks; the executors behind approving
-- a driver assignment, a reassignment or releasing a pickup; and the driver app's functions.
--
-- Access: coordinators read everything here and decide through proposals; the programs team and
-- the front desk read assignments ("on the way"); a driver reaches only their own trips, through
-- the functions at the end. Flight data and simulation ticks are written by the worker
-- (vip_system).

create type public.flight_update_source as enum ('live', 'simulated', 'manual');
create type public.assignment_status as enum ('active', 'released', 'completed');

-- Minutes late against the schedule (negative = early), from the best-known arrival time.
alter table public.flights
  add column delay_minutes integer generated always as (
    case
      when scheduled_arrival_at is null then null
      else (extract(epoch from (
        coalesce(manual_arrival_at, actual_arrival_at, estimated_arrival_at, scheduled_arrival_at) - scheduled_arrival_at
      )) / 60)::integer
    end
  ) stored;
create index flights_next_check_idx on public.flights (next_check_at) where phase not in ('landed', 'cancelled');

-- Why a coordinator must look at an arrival (e.g. its flight was cancelled or diverted).
alter table public.arrivals add column attention text check (char_length(attention) <= 200);

-- What the driver must acknowledge when a pickup time moves.
alter table public.pickups
  add column previous_pickup_at timestamptz,
  add column changed_at timestamptz;

create table public.flight_updates (
  id bigint generated always as identity primary key,
  event_id uuid not null default private.current_event_id() references public.events (id),
  flight_id uuid not null references public.flights (id) on delete cascade,
  observed_at timestamptz not null,
  source public.flight_update_source not null,
  -- {field: [old, new]} for every field that changed.
  changes jsonb not null default '{}'::jsonb,
  payload jsonb,
  simulation_run_id uuid,
  -- Reassignment latency (PRD §8 M2): observed → every follow-up written.
  cascade_completed_at timestamptz,
  cascade_ms integer,
  created_at timestamptz not null default now()
);
create index flight_updates_flight_idx on public.flight_updates (flight_id, observed_at desc);

create table public.pickup_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  pickup_id uuid not null references public.pickups (id) on delete cascade,
  driver_id uuid not null references public.drivers (id),
  status public.assignment_status not null default 'active',
  proposal_id uuid references public.proposals (id),
  acknowledged_at timestamptz,
  en_route_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  released_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A large delegation can need several vehicles: one active row per driver per pickup.
create unique index pickup_assignments_one_active on public.pickup_assignments (pickup_id, driver_id)
  where status = 'active';
create index pickup_assignments_driver_idx on public.pickup_assignments (driver_id) where status = 'active';

create table public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  -- Scenarios are versioned with the code (lib/domain/simulation/scenarios.ts).
  scenario_key text not null check (scenario_key ~ '^[a-z0-9_-]{1,50}$'),
  status text not null default 'running' check (status in ('running', 'stopped', 'completed')),
  speed integer not null check (speed between 1 and 3600),
  -- The flights the scenario's steps act on (step.flight indexes this), fixed at start.
  flight_ids uuid[] not null default '{}' check (pg_catalog.cardinality(flight_ids) <= 10),
  virtual_start timestamptz not null,
  real_start timestamptz not null default now(),
  steps_applied integer not null default 0,
  started_by uuid references public.profiles (id),
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index simulation_runs_one_running on public.simulation_runs (event_id) where status = 'running';

create table public.provider_usage_daily (
  day date not null,
  provider text not null check (char_length(provider) <= 50),
  calls integer not null default 0,
  primary key (day, provider)
);

-- One worker tick at a time, whatever runs it (the app process or a separate worker): a tick
-- claims the lease for a short while; a crashed holder's lease simply runs out.
create table public.worker_leases (
  name text primary key check (name ~ '^[a-z_]{1,50}$'),
  holder text not null check (char_length(holder) <= 100),
  expires_at timestamptz not null
);
select private.enable_rls('public.worker_leases');

create trigger set_updated_at before update on public.pickup_assignments
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.simulation_runs
  for each row execute function private.set_updated_at();
select private.attach_audit('public.pickup_assignments');
select private.attach_audit('public.simulation_runs');
select private.enable_rls('public.flight_updates');
select private.enable_rls('public.pickup_assignments');
select private.enable_rls('public.simulation_runs');
select private.enable_rls('public.provider_usage_daily');

grant select on public.flight_updates to vip_app;
create policy flight_updates_select on public.flight_updates for select to vip_app
  using ((select private.is_coordinator_plus()));

grant select on public.pickup_assignments to vip_app;
create policy pickup_assignments_select on public.pickup_assignments for select to vip_app
  using (
    (select private.is_coordinator_plus())
    or (select private.has_role('programs', 'accommodation'))
    or driver_id in (select d.id from public.drivers d where d.profile_id = (select private.current_user_id()))
  );
-- Writes go through proposals (approve_proposal) and the driver functions below.

grant select, insert on public.simulation_runs to vip_app;
grant update (status, stopped_at) on public.simulation_runs to vip_app;
create policy simulation_runs_select on public.simulation_runs for select to vip_app
  using ((select private.is_coordinator_plus()));
create policy simulation_runs_insert on public.simulation_runs for insert to vip_app
  with check ((select private.is_coordinator_plus()) and status = 'running');
create policy simulation_runs_update on public.simulation_runs for update to vip_app
  using ((select private.is_coordinator_plus())) with check ((select private.is_coordinator_plus()));

grant select on public.provider_usage_daily to vip_app;
create policy provider_usage_daily_select on public.provider_usage_daily for select to vip_app
  using ((select private.is_coordinator_plus()));

-- Feasibility (FR-FT-06) ------------------------------------------------------------------

-- The time a driver is busy for a pickup: the drive to the pickup point and on to the drop-off,
-- using the event's fixed travel times (no traffic prediction).
create function private.trip_window(p_pickup public.pickups)
returns tstzrange
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.tstzrange(
    p_pickup.pickup_at - pg_catalog.make_interval(mins => travel.minutes),
    p_pickup.pickup_at + pg_catalog.make_interval(mins => travel.minutes),
    '[)'
  )
  from (
    select case when p_pickup.kind = 'airport' then e.airport_travel_min else e.local_travel_min end as minutes
    from public.events e
    where e.id = p_pickup.event_id
  ) travel
$$;

-- Why a driver cannot take a trip in this window, or null when they can: active, one shift
-- covering the whole window, and no other live trip overlapping it.
create function private.driver_unavailability(p_driver_id uuid, p_window tstzrange, p_exclude_pickup uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  select d.is_active into v_active from public.drivers d where d.id = p_driver_id;
  if not found then
    return 'not_found';
  end if;
  if not v_active then
    return 'inactive';
  end if;
  if not exists (
    select 1 from public.driver_shifts s
    where s.driver_id = p_driver_id and pg_catalog.tstzrange(s.starts_at, s.ends_at, '[)') @> p_window
  ) then
    return 'off_shift';
  end if;
  if exists (
    select 1
    from public.pickup_assignments a
    join public.pickups p on p.id = a.pickup_id
    where a.driver_id = p_driver_id
      and a.status = 'active'
      and p.id <> p_exclude_pickup
      and p.status not in ('cancelled', 'completed')
      and private.trip_window(p) && p_window
  ) then
    return 'busy';
  end if;
  return null;
end
$$;
grant execute on function private.trip_window(public.pickups) to vip_system;
grant execute on function private.driver_unavailability(uuid, tstzrange, uuid) to vip_system;

-- Executors behind approve_proposal --------------------------------------------------------

-- driver_assignment / driver_reassignment, payload {pickup_id, driver_ids[]}. Re-checks every
-- driver against the pickup's current time before changing anything; on failure nothing is
-- written and the reason is returned.
create function private.execute_driver_proposal(p_proposal public.proposals)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pickup public.pickups;
  v_window tstzrange;
  v_driver_ids uuid[];
  v_driver uuid;
  v_reason text;
  v_seats integer;
  v_added uuid[];
  v_time text;
begin
  begin
    select * into v_pickup from public.pickups where id = (p_proposal.payload ->> 'pickup_id')::uuid for update;
    v_driver_ids := array(
      select distinct value::uuid from pg_catalog.jsonb_array_elements_text(coalesce(p_proposal.payload -> 'driver_ids', '[]'::jsonb))
    );
  exception when invalid_text_representation or invalid_parameter_value then
    return pg_catalog.jsonb_build_object('error', 'invalid_payload');
  end;
  if v_pickup.id is null or v_pickup.status in ('picked_up', 'completed', 'cancelled') then
    return pg_catalog.jsonb_build_object('error', 'pickup_closed');
  end if;
  if pg_catalog.cardinality(v_driver_ids) = 0 then
    return pg_catalog.jsonb_build_object('error', 'no_driver');
  end if;
  -- Two approvals naming the same driver for overlapping trips must not both pass the check below:
  -- lock the drivers (in a fixed order, so concurrent approvals cannot deadlock) first.
  perform 1 from public.drivers d where d.id = any (v_driver_ids) order by d.id for update;

  v_window := private.trip_window(v_pickup);
  foreach v_driver in array v_driver_ids loop
    v_reason := private.driver_unavailability(v_driver, v_window, v_pickup.id);
    if v_reason is not null then
      return pg_catalog.jsonb_build_object('error', 'driver_' || v_reason, 'driver_id', v_driver);
    end if;
  end loop;
  select coalesce(sum(d.vehicle_capacity), 0) into v_seats from public.drivers d where d.id = any (v_driver_ids);
  if v_seats < v_pickup.passenger_count then
    return pg_catalog.jsonb_build_object('error', 'not_enough_seats');
  end if;

  select pg_catalog.to_char(v_pickup.pickup_at at time zone e.timezone, 'HH24:MI') into v_time
  from public.events e where e.id = v_pickup.event_id;

  -- Drivers who lose the trip hear about it first.
  perform private.notify_users(
    array(
      select d.profile_id from public.pickup_assignments a join public.drivers d on d.id = a.driver_id
      where a.pickup_id = v_pickup.id and a.status = 'active' and not (a.driver_id = any (v_driver_ids))
    ),
    'pickup_moved', 'The ' || v_time || ' pickup was moved to another driver', null, 'high', 'pickups', v_pickup.id
  );
  update public.pickup_assignments
  set status = 'released', released_at = pg_catalog.now()
  where pickup_id = v_pickup.id and status = 'active' and not (driver_id = any (v_driver_ids));

  v_added := array(
    select d from pg_catalog.unnest(v_driver_ids) as d
    where not exists (
      select 1 from public.pickup_assignments a where a.pickup_id = v_pickup.id and a.driver_id = d and a.status = 'active'
    )
  );
  insert into public.pickup_assignments (pickup_id, driver_id, proposal_id, created_by)
  select v_pickup.id, d, p_proposal.id, private.current_user_id() from pg_catalog.unnest(v_added) as d;
  update public.pickups set status = 'assigned' where id = v_pickup.id and status = 'pending_assignment';

  perform private.notify_users(
    array(select d.profile_id from public.drivers d where d.id = any (v_added)),
    'pickup_assigned', 'New pickup at ' || v_time || ': ' || v_pickup.pickup_location, null, 'high', 'pickups', v_pickup.id
  );
  return pg_catalog.jsonb_build_object('pickup_id', v_pickup.id, 'driver_ids', pg_catalog.to_jsonb(v_driver_ids));
end
$$;

-- release_pickup, payload {pickup_id}: the trip is no longer needed (cancelled flight, FR-FT-08).
create function private.execute_release_pickup(p_proposal public.proposals)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pickup public.pickups;
begin
  begin
    select * into v_pickup from public.pickups where id = (p_proposal.payload ->> 'pickup_id')::uuid for update;
  exception when invalid_text_representation then
    return pg_catalog.jsonb_build_object('error', 'invalid_payload');
  end;
  if v_pickup.id is null or v_pickup.status in ('picked_up', 'completed') then
    return pg_catalog.jsonb_build_object('error', 'pickup_closed');
  end if;
  perform private.notify_users(
    array(
      select d.profile_id from public.pickup_assignments a join public.drivers d on d.id = a.driver_id
      where a.pickup_id = v_pickup.id and a.status = 'active'
    ),
    'pickup_cancelled', 'A pickup was cancelled', v_pickup.pickup_location, 'high', 'pickups', v_pickup.id
  );
  update public.pickup_assignments
  set status = 'released', released_at = pg_catalog.now()
  where pickup_id = v_pickup.id and status = 'active';
  update public.pickups set status = 'cancelled' where id = v_pickup.id;
  return pg_catalog.jsonb_build_object('pickup_id', v_pickup.id);
end
$$;

-- Approval now executes driver proposals and pickup releases; room proposals (P4) and Co-Pilot
-- actions (P7) still answer 501. A proposal that can no longer be carried out (the driver became
-- busy, the pickup closed) is marked failed with the reason, and nothing else changes.
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

-- Driver app (FR-FT-09) ---------------------------------------------------------------------

create function private.my_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.drivers d
  where d.profile_id = private.current_user_id() and d.is_active and private.has_role('driver')
$$;

-- The signed-in driver's trips on a day of the event (time zone of the event): only what the trip
-- needs. A trip moved to another driver keeps just its time and who it was for (the app's "Moved"
-- card); its route, flight and passengers are no longer this driver's business.
create function public.my_driver_pickups(p_day date)
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

-- The driver's one status button: en_route → picked_up → completed. Completing the trip marks the
-- party as arrived.
create function public.set_trip_status(p_assignment_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assignment public.pickup_assignments;
  v_pickup_status public.pickup_status;
  v_arrival_id uuid;
begin
  select a.* into v_assignment
  from public.pickup_assignments a
  where a.id = p_assignment_id and a.driver_id = private.my_driver_id()
  for update;
  if not found then
    raise exception 'Trip % not found', p_assignment_id using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_assignment.status <> 'active' then
    raise exception 'This trip is no longer yours to update' using errcode = '55000', hint = 'not_active';
  end if;
  select p.status into v_pickup_status from public.pickups p where p.id = v_assignment.pickup_id for update;
  if v_pickup_status in ('cancelled', 'completed') then
    raise exception 'This pickup is closed' using errcode = '55000', hint = 'pickup_closed';
  end if;
  if p_status = 'picked_up' and v_assignment.en_route_at is null then
    raise exception 'Start the pickup first' using errcode = '55000', hint = 'not_started';
  end if;

  perform private.set_audit_context(p_action => 'pickups.trip_status');
  if p_status = 'en_route' then
    update public.pickup_assignments
    set en_route_at = coalesce(en_route_at, pg_catalog.now()), acknowledged_at = coalesce(acknowledged_at, pg_catalog.now())
    where id = p_assignment_id;
    update public.pickups set status = 'en_route' where id = v_assignment.pickup_id and status in ('pending_assignment', 'assigned');
  elsif p_status = 'picked_up' then
    update public.pickup_assignments set picked_up_at = coalesce(picked_up_at, pg_catalog.now()) where id = p_assignment_id;
    update public.pickups set status = 'picked_up' where id = v_assignment.pickup_id;
  elsif p_status = 'completed' then
    if v_assignment.picked_up_at is null then
      raise exception 'Mark the passengers as picked up first' using errcode = '55000', hint = 'not_picked_up';
    end if;
    update public.pickup_assignments set status = 'completed', completed_at = pg_catalog.now() where id = p_assignment_id;
    if not exists (select 1 from public.pickup_assignments where pickup_id = v_assignment.pickup_id and status = 'active') then
      update public.pickups set status = 'completed' where id = v_assignment.pickup_id
      returning arrival_id into v_arrival_id;
      update public.arrivals set status = 'arrived' where id = v_arrival_id;
      update public.guests set status = 'arrived' where arrival_id = v_arrival_id and status = 'expected';
      update public.delegations set status = 'arrived'
      where id = (select a.delegation_id from public.arrivals a where a.id = v_arrival_id) and status = 'expected';
    end if;
  else
    raise exception 'Unknown trip status %', p_status using errcode = '22023', hint = 'invalid_status';
  end if;
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('assignment_id', p_assignment_id, 'status', p_status);
end
$$;

-- "Got it" on a changed or new trip.
create function public.acknowledge_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.pickup_assignments set acknowledged_at = pg_catalog.now()
  where id = p_assignment_id and driver_id = private.my_driver_id() and status = 'active';
  if not found then
    raise exception 'Trip % not found', p_assignment_id using errcode = 'P0002', hint = 'not_found';
  end if;
  return pg_catalog.jsonb_build_object('assignment_id', p_assignment_id);
end
$$;

grant execute on function public.my_driver_pickups(date) to vip_app;
grant execute on function public.set_trip_status(uuid, text) to vip_app;
grant execute on function public.acknowledge_assignment(uuid) to vip_app;

-- migrate:down
-- approve_proposal returns to its P1 form: every kind answers 501 until its executor exists.
create or replace function public.approve_proposal(p_proposal_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
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
  raise exception 'Approving % proposals is not available yet', v_proposal.kind
    using errcode = '0A000', hint = 'not_implemented';
end
$$;
drop function if exists public.acknowledge_assignment(uuid);
drop function if exists public.set_trip_status(uuid, text);
drop function if exists public.my_driver_pickups(date);
drop function if exists private.my_driver_id();
drop function if exists private.execute_release_pickup(public.proposals);
drop function if exists private.execute_driver_proposal(public.proposals);
drop function if exists private.driver_unavailability(uuid, tstzrange, uuid);
drop function if exists private.trip_window(public.pickups);
drop table if exists public.worker_leases;
drop table if exists public.provider_usage_daily;
drop table if exists public.simulation_runs;
drop table if exists public.pickup_assignments;
drop table if exists public.flight_updates;
alter table public.pickups drop column if exists changed_at, drop column if exists previous_pickup_at;
alter table public.arrivals drop column if exists attention;
drop index if exists public.flights_next_check_idx;
alter table public.flights drop column if exists delay_minutes;
drop type if exists public.assignment_status;
drop type if exists public.flight_update_source;
