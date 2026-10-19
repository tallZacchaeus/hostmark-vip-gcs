-- migrate:up
-- Venue and transport reference data managed by Admin (FR-PL-04, FR-PL-05) and the
-- VIP category rank list managed by coordinators (FR-PL-06).

create table public.vip_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  rank smallint not null check (rank between 1 and 99),
  preferred_room_tier smallint check (preferred_room_tier between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so a reorder can swap ranks inside one transaction.
  constraint vip_categories_rank_unique unique (event_id, rank) deferrable initially immediate,
  constraint vip_categories_name_unique unique (event_id, name)
);

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  tier smallint not null check (tier between 1 and 99),
  default_capacity smallint not null check (default_capacity between 1 and 20),
  cleaning_minutes integer not null check (cleaning_minutes between 5 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_types_name_unique unique (event_id, name)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  number text not null check (number ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,19}$'),
  floor smallint not null check (floor between -5 and 200),
  wing text not null check (char_length(btrim(wing)) between 1 and 50),
  position integer not null default 0 check (position between 0 and 10000),
  room_type_id uuid not null references public.room_types (id),
  -- Defaults to the room type's default_capacity when omitted (trigger below).
  capacity smallint not null check (capacity between 1 and 20),
  is_accessible boolean not null default false,
  housekeeping_status public.housekeeping_status not null default 'clean',
  out_of_service boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_number_unique unique (event_id, number)
);
create index rooms_room_type_id_idx on public.rooms (room_type_id);
create index rooms_location_idx on public.rooms (floor, wing, position);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  -- Optional login for the driver app. Must belong to a profile with the driver role.
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  vehicle_label text check (char_length(vehicle_label) <= 100),
  vehicle_capacity smallint not null check (vehicle_capacity between 1 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_shifts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_shifts_valid_range
    check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  constraint driver_shifts_no_overlap
    exclude using gist (driver_id with =, tstzrange(starts_at, ends_at) with &&)
);

-- Triggers ------------------------------------------------------------------------------

create function private.default_room_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capacity is null then
    select rt.default_capacity into new.capacity
    from public.room_types rt
    where rt.id = new.room_type_id;
  end if;
  return new;
end
$$;

create trigger default_room_capacity before insert on public.rooms
  for each row execute function private.default_room_capacity();

create function private.check_driver_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.profile_id and p.role = 'driver'
  ) then
    raise exception 'The linked login must have the Driver role'
      using errcode = '23514', hint = 'driver_profile_role';
  end if;
  return new;
end
$$;

create trigger check_driver_profile_role before insert or update of profile_id on public.drivers
  for each row execute function private.check_driver_profile_role();

do $$
declare
  v_table text;
begin
  foreach v_table in array array['vip_categories', 'room_types', 'rooms', 'drivers', 'driver_shifts']
  loop
    execute pg_catalog.format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function private.set_updated_at()',
      v_table
    );
    perform private.attach_audit(pg_catalog.format('public.%I', v_table)::regclass);
    perform private.enable_rls(pg_catalog.format('public.%I', v_table)::regclass);
    execute pg_catalog.format('grant select, insert, update, delete on public.%I to vip_app', v_table);
  end loop;
end
$$;

-- Policies --------------------------------------------------------------------------------

-- VIP categories: coordinators edit; programs team reads (participant ranks).
create policy vip_categories_select on public.vip_categories for select to vip_app
  using ((select private.has_role('super_admin', 'admin', 'coordinator', 'programs')));
create policy vip_categories_write on public.vip_categories for all to vip_app
  using ((select private.is_coordinator_plus()))
  with check ((select private.is_coordinator_plus()));

-- Room types and rooms: Admin edits; coordinators, accommodation and housekeeping read.
create policy room_types_select on public.room_types for select to vip_app
  using ((select private.has_role('super_admin', 'admin', 'coordinator', 'accommodation', 'housekeeping')));
create policy room_types_insert on public.room_types for insert to vip_app
  with check ((select private.is_admin_plus()));
create policy room_types_update on public.room_types for update to vip_app
  using ((select private.is_admin_plus())) with check ((select private.is_admin_plus()));
create policy room_types_delete on public.room_types for delete to vip_app
  using ((select private.is_admin_plus()));

create policy rooms_select on public.rooms for select to vip_app
  using ((select private.has_role('super_admin', 'admin', 'coordinator', 'accommodation', 'housekeeping')));
create policy rooms_insert on public.rooms for insert to vip_app
  with check ((select private.is_admin_plus()));
create policy rooms_update on public.rooms for update to vip_app
  using ((select private.is_admin_plus())) with check ((select private.is_admin_plus()));
create policy rooms_delete on public.rooms for delete to vip_app
  using ((select private.is_admin_plus()));

-- Drivers and shifts: Admin edits; coordinators read; a driver reads only their own record.
create policy drivers_select on public.drivers for select to vip_app
  using (
    (select private.is_coordinator_plus())
    or ((select private.has_role('driver')) and profile_id = (select private.current_user_id()))
  );
create policy drivers_insert on public.drivers for insert to vip_app
  with check ((select private.is_admin_plus()));
create policy drivers_update on public.drivers for update to vip_app
  using ((select private.is_admin_plus())) with check ((select private.is_admin_plus()));
create policy drivers_delete on public.drivers for delete to vip_app
  using ((select private.is_admin_plus()));

create policy driver_shifts_select on public.driver_shifts for select to vip_app
  using (
    (select private.is_coordinator_plus())
    or driver_id in (
      select d.id from public.drivers d
      where d.profile_id = (select private.current_user_id())
    )
  );
create policy driver_shifts_insert on public.driver_shifts for insert to vip_app
  with check ((select private.is_admin_plus()));
create policy driver_shifts_update on public.driver_shifts for update to vip_app
  using ((select private.is_admin_plus())) with check ((select private.is_admin_plus()));
create policy driver_shifts_delete on public.driver_shifts for delete to vip_app
  using ((select private.is_admin_plus()));

-- Functions --------------------------------------------------------------------------------

-- Sets the rank order of all VIP categories in one step (1 = highest).
create function public.reorder_vip_categories(p_ids uuid[])
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if not private.is_coordinator_plus() then
    raise exception 'Only coordinators can reorder VIP categories'
      using errcode = '42501', hint = 'forbidden';
  end if;

  if coalesce(pg_catalog.cardinality(p_ids), 0) <> (select count(*) from public.vip_categories)
     or (select count(distinct x) from pg_catalog.unnest(p_ids) as x) <> pg_catalog.cardinality(p_ids)
     or exists (
       select 1 from pg_catalog.unnest(p_ids) as x
       where x not in (select c.id from public.vip_categories c)
     ) then
    raise exception 'List every VIP category exactly once, in the new order'
      using errcode = '22023', hint = 'invalid_order';
  end if;

  set constraints public.vip_categories_rank_unique deferred;

  update public.vip_categories c
  set rank = o.ordinality
  from pg_catalog.unnest(p_ids) with ordinality as o (id, ordinality)
  where c.id = o.id and c.rank <> o.ordinality;
end
$$;
grant execute on function public.reorder_vip_categories(uuid[]) to vip_app;

-- migrate:down
drop function if exists public.reorder_vip_categories(uuid[]);
drop table if exists public.driver_shifts;
drop table if exists public.drivers;
drop table if exists public.rooms;
drop table if exists public.room_types;
drop table if exists public.vip_categories;
drop function if exists private.check_driver_profile_role();
drop function if exists private.default_room_capacity();
