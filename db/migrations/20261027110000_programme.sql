-- migrate:up
-- Event programme (P6, FR-PG-01…04): items with VIP participants, and the arrival conflict check
-- (an item is at risk when a participant is expected at the venue after its start minus the event's
-- lead time). The flag is kept by triggers whenever items, participants, arrivals or guests change,
-- so a flight delay flags the item through the normal cascade and the flag clears by itself.

create type public.program_item_kind as enum ('session', 'ceremony', 'meal', 'performance', 'other');
create type public.program_item_status as enum ('draft', 'published', 'cancelled');
create type public.program_role as enum ('speaker', 'honoree', 'performer', 'attendee');

create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  kind public.program_item_kind not null default 'session',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (char_length(btrim(location)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  status public.program_item_status not null default 'draft',
  -- Kept by private.refresh_program_risk, never written by the API.
  at_risk boolean not null default false,
  risk_notified_at timestamptz,
  risk_notified_by uuid references public.profiles (id),
  created_by uuid default private.current_user_id() references public.profiles (id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_items_window check (ends_at > starts_at)
);
create index program_items_starts_idx on public.program_items (starts_at);

create table public.program_participants (
  id uuid primary key default gen_random_uuid(),
  program_item_id uuid not null references public.program_items (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  role public.program_role not null default 'attendee',
  created_at timestamptz not null default now(),
  constraint program_participants_unique unique (program_item_id, guest_id)
);
create index program_participants_guest_idx on public.program_participants (guest_id);

create trigger set_updated_at before update on public.program_items
  for each row execute function private.set_updated_at();
create trigger bump_version before update on public.program_items
  for each row execute function private.bump_version();
select private.attach_audit('public.program_items');
select private.attach_audit('public.program_participants');
select private.enable_rls('public.program_items');
select private.enable_rls('public.program_participants');

-- The programs team (and Admin, the operations lead) drafts and publishes; coordinators see the
-- published programme (FR-PG-04). Other staff roles have no access.
grant select, delete on public.program_items to vip_app;
grant insert (title, kind, starts_at, ends_at, location, description, status) on public.program_items to vip_app;
grant update (title, kind, starts_at, ends_at, location, description, status) on public.program_items to vip_app;
grant select, delete on public.program_participants to vip_app;
grant insert (program_item_id, guest_id, role) on public.program_participants to vip_app;
grant update (role) on public.program_participants to vip_app;

create policy program_items_select on public.program_items for select to vip_app
  using (
    (select private.has_role('super_admin', 'admin', 'programs'))
    or ((select private.has_role('coordinator')) and status <> 'draft')
  );
create policy program_items_insert on public.program_items for insert to vip_app
  with check ((select private.has_role('super_admin', 'admin', 'programs')));
create policy program_items_update on public.program_items for update to vip_app
  using ((select private.has_role('super_admin', 'admin', 'programs')))
  with check ((select private.has_role('super_admin', 'admin', 'programs')));
create policy program_items_delete on public.program_items for delete to vip_app
  using ((select private.has_role('super_admin', 'admin', 'programs')));

-- Participants follow their item's visibility.
create policy program_participants_select on public.program_participants for select to vip_app
  using (exists (select 1 from public.program_items i where i.id = program_item_id));
create policy program_participants_write on public.program_participants for all to vip_app
  using ((select private.has_role('super_admin', 'admin', 'programs')))
  with check ((select private.has_role('super_admin', 'admin', 'programs')));

-- The arrival conflict check (FR-PG-03) ---------------------------------------------------------

-- Participants who put the item at risk: not arrived, not cancelled, and expected at the venue
-- after the start minus the lead time. Items that are cancelled or already over have no risk.
-- Invoker rights: callers see only the participants their role may read.
create function private.program_item_risks(p_item_id uuid)
returns table (guest_id uuid, full_name text, expected_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select g.id, pg_catalog.concat_ws(' ', g.title, g.full_name),
    coalesce(a.expected_at_venue_at, a.stated_arrival_at, a.requested_pickup_at)
  from public.program_items i
  join public.events e on e.id = i.event_id
  join public.program_participants pp on pp.program_item_id = i.id
  join public.guests g on g.id = pp.guest_id
  join public.arrivals a on a.id = g.arrival_id
  where i.id = p_item_id
    and i.status <> 'cancelled'
    and i.ends_at > pg_catalog.now()
    and g.status in ('expected')
    and a.status = 'expected'
    and coalesce(a.expected_at_venue_at, a.stated_arrival_at, a.requested_pickup_at)
        > i.starts_at - pg_catalog.make_interval(mins => e.program_lead_time_min)
  order by 3 desc, 2
$$;
grant execute on function private.program_item_risks(uuid) to vip_app, vip_system;

-- Recomputes an item's flag (the row is locked, so concurrent changes cannot both alert). A
-- published item that becomes at risk (or is published while at risk, `p_publishing`) tells the
-- programs team and the coordinators who is late; when the risk clears, so does "team notified".
-- The alert can never abort the change that caused it (often the flight cascade).
create function private.refresh_program_risk(p_item_id uuid, p_publishing boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_count integer;
  v_first record;
  v_risk boolean;
begin
  select i.title, i.status, i.at_risk, e.timezone into v_item
  from public.program_items i join public.events e on e.id = i.event_id
  where i.id = p_item_id
  for update of i;
  if not found then
    return;
  end if;
  select count(*) into v_count from private.program_item_risks(p_item_id);
  v_risk := v_count > 0;
  if v_risk is distinct from v_item.at_risk then
    update public.program_items
    set at_risk = v_risk,
        risk_notified_at = case when v_risk then risk_notified_at end,
        risk_notified_by = case when v_risk then risk_notified_by end
    where id = p_item_id;
  end if;
  if not v_risk or v_item.status <> 'published' or (v_item.at_risk and not p_publishing) then
    return;
  end if;
  begin
    select * into v_first from private.program_item_risks(p_item_id) limit 1;
    perform private.notify_roles(
      array['programs', 'super_admin', 'admin', 'coordinator']::public.app_role[], 'program_at_risk',
      v_item.title || ' at risk: ' || v_first.full_name || ' expected '
        || pg_catalog.to_char(v_first.expected_at at time zone v_item.timezone, 'HH24:MI')
        || case when v_count > 1 then ' and ' || (v_count - 1) || ' more' else '' end,
      null, 'high', 'program_items', p_item_id
    );
  exception when others then
    raise warning 'Programme at-risk alert for % was not sent: %', p_item_id, sqlerrm;
  end;
end
$$;

create function private.program_items_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_program_risk(
    new.id, tg_op = 'UPDATE' and new.status = 'published' and old.status is distinct from 'published'
  );
  return null;
end
$$;
create trigger program_items_changed after insert or update of starts_at, ends_at, status on public.program_items
  for each row execute function private.program_items_changed();

create function private.program_participants_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_program_risk(coalesce(new.program_item_id, old.program_item_id));
  return null;
end
$$;
create trigger program_participants_changed after insert or update or delete on public.program_participants
  for each row execute function private.program_participants_changed();

-- An arrival moving (the flight cascade, a manual landing time) or a guest arriving re-checks
-- every item their participants are on.
create function private.program_arrivals_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item uuid;
begin
  for v_item in
    select distinct pp.program_item_id
    from public.program_participants pp
    join public.guests g on g.id = pp.guest_id
    where (tg_table_name = 'arrivals' and g.arrival_id = new.id) or (tg_table_name = 'guests' and g.id = new.id)
    order by pp.program_item_id
  loop
    perform private.refresh_program_risk(v_item);
  end loop;
  return null;
end
$$;
create trigger program_arrivals_changed after update of expected_at_venue_at, stated_arrival_at, requested_pickup_at, status on public.arrivals
  for each row execute function private.program_arrivals_changed();
create trigger program_guests_changed after update of status, arrival_id on public.guests
  for each row execute function private.program_arrivals_changed();

-- Figma "Notify programme team": a coordinator asks the programs team to act on an at-risk item.
create function public.notify_program_risk(p_item_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_at_risk boolean;
  v_notified timestamptz;
begin
  if not (private.is_coordinator_plus() or private.has_role('programs')) then
    raise exception 'Only coordinators and the programs team can do this' using errcode = '42501', hint = 'forbidden';
  end if;
  select title, at_risk, risk_notified_at into v_title, v_at_risk, v_notified
  from public.program_items where id = p_item_id and status = 'published' for update;
  if not found then
    raise exception 'Programme item not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not v_at_risk then
    raise exception 'This item is no longer at risk' using errcode = '55000', hint = 'not_at_risk';
  end if;
  -- Once per risk episode (the mark clears when the risk does).
  if v_notified is not null then
    raise exception 'The programs team has already been told' using errcode = '55000', hint = 'already_notified';
  end if;
  perform private.set_audit_context(p_action => 'programme.notify_team');
  update public.program_items set risk_notified_at = pg_catalog.now(), risk_notified_by = private.current_user_id() where id = p_item_id;
  perform private.notify_roles(
    array['programs']::public.app_role[], 'program_risk_flagged', 'Please review: ' || v_title || ' is at risk',
    null, 'high', 'program_items', p_item_id
  );
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('id', p_item_id, 'notified_at', pg_catalog.now());
end
$$;
grant execute on function public.notify_program_risk(uuid) to vip_app;

-- migrate:down
drop function if exists public.notify_program_risk(uuid);
drop trigger if exists program_guests_changed on public.guests;
drop trigger if exists program_arrivals_changed on public.arrivals;
drop function if exists private.program_arrivals_changed();
drop table if exists public.program_participants;
drop table if exists public.program_items;
drop function if exists private.program_participants_changed();
drop function if exists private.program_items_changed();
drop function if exists private.refresh_program_risk(uuid, boolean);
drop function if exists private.program_item_risks(uuid);
drop type if exists public.program_role;
drop type if exists public.program_item_status;
drop type if exists public.program_item_kind;
