-- migrate:up
-- Event settings (FR-PL-03), staff accounts and the tables used by Better Auth.
-- profiles is Better Auth's "user" model (lib/auth/auth.ts maps its fields to these columns).

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  venue_name text not null check (char_length(btrim(venue_name)) between 1 and 200),
  timezone text not null default 'UTC' check (private.is_valid_timezone(timezone)),
  starts_on date not null,
  ends_on date not null,
  arrival_airports text[] not null default '{}'
    check (
      pg_catalog.array_position(arrival_airports, null) is null
      and pg_catalog.array_to_string(arrival_airports, ',') ~ '^([A-Z]{3}(,[A-Z]{3})*)?$'
    ),
  intake_token text not null unique default private.new_intake_token(),
  intake_open boolean not null default false,
  intake_window_days integer not null default 3 check (intake_window_days between 0 and 30),
  airport_exit_buffer_min integer not null default 30 check (airport_exit_buffer_min between 0 and 240),
  airport_travel_min integer not null default 60 check (airport_travel_min between 0 and 600),
  local_travel_min integer not null default 45 check (local_travel_min between 0 and 600),
  delay_threshold_min integer not null default 15 check (delay_threshold_min between 0 and 240),
  cleaning_delay_buffer_min integer not null default 15 check (cleaning_delay_buffer_min between 0 and 240),
  program_lead_time_min integer not null default 30 check (program_lead_time_min between 0 and 240),
  flight_mode text not null default 'simulated' check (flight_mode in ('live', 'simulated')),
  auto_process_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_dates_ordered check (ends_on >= starts_on)
);

-- The MVP supports exactly one event (00-Project-Breakdown.md section 10).
create unique index events_singleton on public.events ((true));

create trigger set_updated_at before update on public.events
  for each row execute function private.set_updated_at();

-- The single event's id. Column default for event_id on every business table.
create function private.current_event_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.events e limit 1
$$;
grant execute on function private.current_event_id() to vip_app, vip_system;

-- Staff accounts. One role per user (01-PRD.md section 3). "banned" is the inverse of
-- the PRD's is_active and is maintained together with Better Auth's admin plugin.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  email text not null unique check (email = pg_catalog.lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  email_verified boolean not null default false,
  image text,
  role public.app_role not null,
  banned boolean not null default false,
  ban_reason text check (char_length(ban_reason) <= 500),
  ban_expires timestamptz,
  must_change_password boolean not null default true,
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where not banned;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  impersonated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_sessions_user_id_idx on public.auth_sessions (user_id);

create table public.auth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, account_id)
);
create index auth_accounts_user_id_idx on public.auth_accounts (user_id);

create table public.auth_verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index auth_verifications_identifier_idx on public.auth_verifications (identifier);

-- Role helpers used by policies. SECURITY DEFINER so they can read profiles without
-- recursing into the profiles policies. A banned account has no role.
create function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = private.current_user_id()
    and (not p.banned or (p.ban_expires is not null and p.ban_expires <= pg_catalog.now()))
$$;

create function private.has_role(variadic p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (p_roles), false)
$$;

create function private.is_coordinator_plus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('coordinator', 'admin', 'super_admin')
$$;

create function private.is_admin_plus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin', 'super_admin')
$$;

grant execute on function private.current_app_role() to vip_app, vip_system;
grant execute on function private.has_role(public.app_role[]) to vip_app, vip_system;
grant execute on function private.is_coordinator_plus() to vip_app, vip_system;
grant execute on function private.is_admin_plus() to vip_app, vip_system;

-- Never leave the system without an active Super Admin.
create function private.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'super_admin' and not old.banned
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or new.banned) then
    -- Serialise these checks so two Super Admins cannot deactivate each other concurrently.
    perform pg_catalog.pg_advisory_xact_lock(7321001);
    if not exists (
      select 1 from public.profiles p
      where p.role = 'super_admin' and not p.banned and p.id <> old.id
    ) then
      raise exception 'At least one active Super Admin account is required'
        using errcode = '55000', hint = 'last_super_admin';
    end if;
  end if;
  return coalesce(new, old);
end
$$;

create trigger guard_last_super_admin before update or delete on public.profiles
  for each row execute function private.guard_last_super_admin();

-- Only a Super Admin may switch between live and simulated flight data (03-App-Flow /admin/system).
create function private.guard_event_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes_mode boolean := false;
begin
  if tg_op = 'INSERT' then
    v_changes_mode := new.flight_mode <> 'simulated';
  else
    v_changes_mode := new.flight_mode is distinct from old.flight_mode;
  end if;
  if v_changes_mode
     and private.current_user_id() is not null
     and not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can change the flight data mode'
      using errcode = '42501', hint = 'forbidden';
  end if;
  return new;
end
$$;

create trigger guard_event_update before insert or update on public.events
  for each row execute function private.guard_event_update();

-- Row-level security ---------------------------------------------------------------

select private.enable_rls('public.events');
select private.enable_rls('public.profiles');
select private.enable_rls('public.auth_sessions');
select private.enable_rls('public.auth_accounts');
select private.enable_rls('public.auth_verifications');
-- auth_* tables: vip_system only (Better Auth). vip_app gets no privileges on them.

grant select on public.events to vip_app;
grant insert (
  name, venue_name, timezone, starts_on, ends_on, arrival_airports, intake_open,
  intake_window_days, airport_exit_buffer_min, airport_travel_min, local_travel_min,
  delay_threshold_min, cleaning_delay_buffer_min, program_lead_time_min, flight_mode,
  auto_process_enabled
) on public.events to vip_app;
grant update (
  name, venue_name, timezone, starts_on, ends_on, arrival_airports, intake_open,
  intake_window_days, airport_exit_buffer_min, airport_travel_min, local_travel_min,
  delay_threshold_min, cleaning_delay_buffer_min, program_lead_time_min, flight_mode,
  auto_process_enabled
) on public.events to vip_app;

create policy events_select on public.events for select to vip_app
  using ((select private.has_role('super_admin', 'admin', 'coordinator', 'programs')));
create policy events_insert on public.events for insert to vip_app
  with check ((select private.is_admin_plus()));
create policy events_update on public.events for update to vip_app
  using ((select private.is_admin_plus()))
  with check ((select private.is_admin_plus()));

grant select on public.profiles to vip_app;
grant update (full_name, phone, role, banned, ban_reason, ban_expires, must_change_password)
  on public.profiles to vip_app;

create policy profiles_select on public.profiles for select to vip_app
  using (id = (select private.current_user_id()) or (select private.is_coordinator_plus()));

-- Super Admin manages everyone. Admin manages staff below Admin and cannot promote to Admin.
create policy profiles_update on public.profiles for update to vip_app
  using (
    (select private.has_role('super_admin'))
    or ((select private.has_role('admin')) and role not in ('admin', 'super_admin'))
  )
  with check (
    (select private.has_role('super_admin'))
    or ((select private.has_role('admin')) and role not in ('admin', 'super_admin'))
  );

-- API-callable functions --------------------------------------------------------------

-- Safe event fields for every signed-in staff member (staff screens need the timezone
-- and the simulated-mode flag but may not read the events table).
create function public.get_event_context()
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
    'starts_on', e.starts_on, 'ends_on', e.ends_on, 'flight_mode', e.flight_mode
  )
  into v_result
  from public.events e;

  return v_result;
end
$$;

create function public.regenerate_intake_token()
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

-- Clears the forced password change flag for the signed-in user (called after the
-- password was changed through Better Auth).
create function public.complete_password_change()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if private.current_user_id() is null then
    raise exception 'Sign in first' using errcode = '42501', hint = 'unauthenticated';
  end if;
  update public.profiles set must_change_password = false
  where id = private.current_user_id();
end
$$;

grant execute on function public.get_event_context() to vip_app;
grant execute on function public.regenerate_intake_token() to vip_app;
grant execute on function public.complete_password_change() to vip_app;

-- migrate:down
drop function if exists public.complete_password_change();
drop function if exists public.regenerate_intake_token();
drop function if exists public.get_event_context();
drop trigger if exists guard_event_update on public.events;
drop function if exists private.guard_event_update();
drop trigger if exists guard_last_super_admin on public.profiles;
drop function if exists private.guard_last_super_admin();
drop function if exists private.is_admin_plus();
drop function if exists private.is_coordinator_plus();
drop function if exists private.has_role(public.app_role[]);
drop function if exists private.current_app_role();
drop table if exists public.auth_verifications;
drop table if exists public.auth_accounts;
drop table if exists public.auth_sessions;
drop table if exists public.profiles;
drop function if exists private.current_event_id();
drop table if exists public.events;
