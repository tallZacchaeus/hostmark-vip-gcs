-- migrate:up
-- The coordination desk's phone number (E.164, optional). Admin sets it in event settings;
-- every signed-in staff member reads it through get_event_context() so the driver app can
-- offer "Call coordinator" without reading the events table.

alter table public.events
  add column coordinator_phone text
    constraint events_coordinator_phone_format check (coordinator_phone ~ '^\+[1-9][0-9]{6,14}$');

grant insert (coordinator_phone), update (coordinator_phone) on public.events to vip_app;

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

-- migrate:down
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
    'starts_on', e.starts_on, 'ends_on', e.ends_on, 'flight_mode', e.flight_mode
  )
  into v_result
  from public.events e;

  return v_result;
end
$$;

revoke insert (coordinator_phone), update (coordinator_phone) on public.events from vip_app;
alter table public.events drop column if exists coordinator_phone;
