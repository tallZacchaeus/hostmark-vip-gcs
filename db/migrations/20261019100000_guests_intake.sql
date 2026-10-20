-- migrate:up
-- Guests and intake (P2, FR-IN-01…11): delegations and their guests, requirements, arrivals with
-- tracked flights and pickups, and the intake submissions that create them.
--
-- Access: coordinators and above read and write; the programs team and front desk read guests and
-- arrivals (programme participants, check-in). Public registrations are written by the server as
-- vip_system; nothing here is reachable by an anonymous database user.

create extension if not exists pg_trgm;

create type public.arrival_mode as enum ('flying', 'own_transport', 'pickup');
create type public.submission_source as enum ('form', 'pasted_message');
create type public.submission_status as enum (
  'received', 'processing', 'auto_processed', 'needs_review', 'approved', 'rejected', 'linked_duplicate'
);
create type public.duplicate_kind as enum ('none', 'exact', 'likely');
create type public.member_role as enum (
  'principal', 'assistant', 'security', 'performer', 'representative', 'family', 'other'
);
create type public.proximity_priority as enum ('high', 'normal', 'low');
create type public.guest_status as enum ('expected', 'arrived', 'checked_in', 'checked_out', 'cancelled');
create type public.flight_phase as enum ('scheduled', 'in_air', 'landed', 'cancelled', 'diverted', 'unknown');
create type public.pickup_kind as enum ('airport', 'location');
create type public.pickup_status as enum (
  'pending_assignment', 'assigned', 'en_route', 'picked_up', 'completed', 'cancelled'
);
create type public.requirement_category as enum (
  'dietary', 'accessibility', 'room_preference', 'security', 'transport', 'schedule', 'medical', 'other'
);

create table public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  reference_code text not null unique check (reference_code ~ '^VIP-[A-Z0-9]{4,8}$'),
  source public.submission_source not null,
  submitted_at timestamptz not null default now(),
  -- What the guest sent (form fields) or the pasted text, kept as received.
  payload jsonb not null,
  -- Form-shaped data after normalisation; edited by the coordinator during review.
  normalized jsonb,
  -- Items extracted from the free-text "others" field or a pasted message.
  extraction jsonb,
  issues jsonb not null default '[]'::jsonb,
  duplicate_kind public.duplicate_kind not null default 'none',
  matched_delegation_id uuid,
  is_high_confidence boolean not null default false,
  status public.submission_status not null default 'received',
  delegation_id uuid,
  ai_model text check (char_length(ai_model) <= 100),
  ai_input_tokens integer,
  ai_output_tokens integer,
  ai_latency_ms integer,
  client_ip_hash text check (char_length(client_ip_hash) <= 128),
  created_by uuid references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index intake_submissions_status_idx on public.intake_submissions (status, submitted_at desc);

create table public.intake_rate_limits (
  ip_hash text not null check (char_length(ip_hash) <= 128),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (ip_hash, window_start)
);

create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  principal_guest_id uuid,
  status text not null default 'expected' check (status in ('expected', 'arrived', 'departed', 'cancelled')),
  created_from_submission_id uuid references public.intake_submissions (id) on delete set null,
  contact_name text check (char_length(contact_name) <= 200),
  contact_email text check (char_length(contact_email) <= 254),
  contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  notes text check (char_length(notes) <= 4000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flights (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  flight_number text not null check (flight_number ~ '^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$'),
  airline_iata text check (airline_iata ~ '^[A-Z0-9]{2}$'),
  arrival_date_local date not null,
  origin_iata text check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text check (destination_iata ~ '^[A-Z]{3}$'),
  scheduled_arrival_at timestamptz,
  estimated_arrival_at timestamptz,
  actual_arrival_at timestamptz,
  manual_arrival_at timestamptz,
  phase public.flight_phase not null default 'scheduled',
  provider text check (char_length(provider) <= 50),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flights_number_date_unique unique (event_id, flight_number, arrival_date_local)
);

create table public.arrivals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  delegation_id uuid not null references public.delegations (id) on delete cascade,
  mode public.arrival_mode not null,
  flight_id uuid references public.flights (id),
  stated_arrival_at timestamptz,
  pickup_address text check (char_length(pickup_address) <= 500),
  requested_pickup_at timestamptz,
  expected_at_venue_at timestamptz,
  status text not null default 'expected' check (status in ('expected', 'arrived', 'cancelled')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arrivals_fields_by_mode check (
    (mode = 'flying' and flight_id is not null)
    or (mode = 'own_transport' and stated_arrival_at is not null)
    or (mode = 'pickup' and pickup_address is not null and requested_pickup_at is not null)
  )
);
create index arrivals_delegation_idx on public.arrivals (delegation_id);
create index arrivals_flight_idx on public.arrivals (flight_id);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  delegation_id uuid not null references public.delegations (id) on delete cascade,
  member_role public.member_role not null default 'other',
  full_name text check (char_length(btrim(full_name)) between 1 and 200),
  is_placeholder boolean not null default false,
  title text check (char_length(title) <= 60),
  organisation text check (char_length(organisation) <= 200),
  position text check (char_length(position) <= 200),
  -- Set by the coordinator, never by the guest (FR-IN-11).
  vip_category_id uuid references public.vip_categories (id),
  proximity_priority public.proximity_priority not null default 'normal',
  share_group text check (char_length(share_group) <= 50),
  arrival_id uuid references public.arrivals (id) on delete set null,
  expected_departure_at timestamptz,
  dietary text[] not null default '{}',
  accessibility text check (char_length(accessibility) <= 500),
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (char_length(email) <= 254),
  status public.guest_status not null default 'expected',
  notes text check (char_length(notes) <= 4000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_named_unless_placeholder check (is_placeholder or full_name is not null)
);
create index guests_delegation_idx on public.guests (delegation_id);
create index guests_arrival_idx on public.guests (arrival_id);
create index guests_name_trgm_idx on public.guests using gin (full_name gin_trgm_ops);

alter table public.delegations
  add constraint delegations_principal_fkey foreign key (principal_guest_id)
  references public.guests (id) on delete set null deferrable initially deferred;
alter table public.intake_submissions
  add constraint intake_submissions_delegation_fkey foreign key (delegation_id)
  references public.delegations (id) on delete set null;
alter table public.intake_submissions
  add constraint intake_submissions_matched_fkey foreign key (matched_delegation_id)
  references public.delegations (id) on delete set null;

create table public.guest_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  guest_id uuid not null references public.guests (id) on delete cascade,
  category public.requirement_category not null,
  detail text not null check (char_length(btrim(detail)) between 1 and 1000),
  -- 'extraction': read from free text (Claude, or the offline rules; the submission records which).
  source text not null check (source in ('form', 'extraction', 'coordinator')),
  source_submission_id uuid references public.intake_submissions (id) on delete set null,
  needs_attention boolean not null default false,
  conflicts_with text check (char_length(conflicts_with) <= 200),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guest_requirements_guest_idx on public.guest_requirements (guest_id);

create table public.pickups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  arrival_id uuid not null references public.arrivals (id) on delete cascade,
  kind public.pickup_kind not null,
  pickup_location text not null check (char_length(btrim(pickup_location)) between 1 and 500),
  dropoff_location text check (char_length(dropoff_location) <= 500),
  pickup_at timestamptz not null,
  passenger_count smallint not null check (passenger_count between 1 and 60),
  status public.pickup_status not null default 'pending_assignment',
  notes text check (char_length(notes) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one live pickup per arrival.
create unique index pickups_one_open_per_arrival on public.pickups (arrival_id) where status <> 'cancelled';
create index pickups_time_idx on public.pickups (pickup_at);

-- Triggers, audit and row-level security ---------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'intake_submissions', 'delegations', 'flights', 'arrivals', 'guests', 'guest_requirements', 'pickups'
  ]
  loop
    execute pg_catalog.format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function private.set_updated_at()',
      v_table
    );
    perform private.attach_audit(pg_catalog.format('public.%I', v_table)::regclass);
    perform private.enable_rls(pg_catalog.format('public.%I', v_table)::regclass);
  end loop;
end
$$;
select private.enable_rls('public.intake_rate_limits');

-- Bumps `version` on every update (optimistic locking for concurrent edits).
create function private.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['delegations', 'arrivals', 'guests', 'pickups']
  loop
    execute pg_catalog.format(
      'create trigger bump_version before update on public.%I '
      'for each row execute function private.bump_version()',
      v_table
    );
  end loop;
end
$$;

-- Guests, delegations, arrivals, flights, pickups, requirements: coordinators write; the programs
-- team and the front desk read (programme participants, check-in).
do $$
declare
  v_table text;
begin
  foreach v_table in array array['delegations', 'flights', 'arrivals', 'guests', 'guest_requirements', 'pickups']
  loop
    execute pg_catalog.format('grant select, insert, update, delete on public.%I to vip_app', v_table);
    execute pg_catalog.format(
      'create policy %1$s_select on public.%1$I for select to vip_app using ('
      '(select private.is_coordinator_plus()) or (select private.has_role(''programs'', ''accommodation'')))',
      v_table
    );
    execute pg_catalog.format(
      'create policy %1$s_write on public.%1$I for all to vip_app '
      'using ((select private.is_coordinator_plus())) with check ((select private.is_coordinator_plus()))',
      v_table
    );
  end loop;
end
$$;

-- Submissions: coordinators read them, create pasted-message drafts and record review decisions.
grant select on public.intake_submissions to vip_app;
grant insert (reference_code, source, payload, normalized, extraction, issues, duplicate_kind,
  matched_delegation_id, is_high_confidence, status, created_by, ai_model, ai_input_tokens,
  ai_output_tokens, ai_latency_ms) on public.intake_submissions to vip_app;
grant update (normalized, extraction, issues, duplicate_kind, matched_delegation_id, is_high_confidence,
  status, delegation_id, reviewed_by, reviewed_at, review_note, ai_model, ai_input_tokens, ai_output_tokens,
  ai_latency_ms) on public.intake_submissions to vip_app;
create policy intake_submissions_select on public.intake_submissions for select to vip_app
  using ((select private.is_coordinator_plus()));
create policy intake_submissions_insert on public.intake_submissions for insert to vip_app
  with check ((select private.is_coordinator_plus()) and source = 'pasted_message');
create policy intake_submissions_update on public.intake_submissions for update to vip_app
  using ((select private.is_coordinator_plus())) with check ((select private.is_coordinator_plus()));
-- intake_rate_limits: vip_system only.

-- Duplicate detection (FR-IN-08) needs trigram similarity for API requests too.
grant execute on function public.similarity(text, text) to vip_app, vip_system;

-- Public intake: is the link open? Used by the registration page before showing the form.
-- Returns only what the form needs (never the token itself or other settings).
create function public.intake_link_context(p_token text)
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
grant execute on function public.intake_link_context(text) to vip_system;

-- migrate:down
drop function if exists public.intake_link_context(text);
revoke execute on function public.similarity(text, text) from vip_app, vip_system;
drop table if exists public.pickups;
drop table if exists public.guest_requirements;
alter table public.intake_submissions drop constraint if exists intake_submissions_matched_fkey;
alter table public.intake_submissions drop constraint if exists intake_submissions_delegation_fkey;
alter table public.delegations drop constraint if exists delegations_principal_fkey;
drop table if exists public.guests;
drop table if exists public.arrivals;
drop table if exists public.flights;
drop table if exists public.delegations;
drop table if exists public.intake_rate_limits;
drop table if exists public.intake_submissions;
drop function if exists private.bump_version();
drop type if exists public.requirement_category;
drop type if exists public.pickup_status;
drop type if exists public.pickup_kind;
drop type if exists public.flight_phase;
drop type if exists public.guest_status;
drop type if exists public.proximity_priority;
drop type if exists public.member_role;
drop type if exists public.duplicate_kind;
drop type if exists public.submission_status;
drop type if exists public.submission_source;
drop type if exists public.arrival_mode;
drop extension if exists pg_trgm;
