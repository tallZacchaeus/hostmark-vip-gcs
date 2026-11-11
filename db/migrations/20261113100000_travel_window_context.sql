-- migrate:up
-- The public registration page keeps arrival and departure inside the event's travel dates
-- (tester feedback, Nov 2026): from intake_window_days before the start to as many days after the
-- end. The page needs the window size; it is a public event setting, not a secret.
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
    'ends_on', e.ends_on,
    'intake_window_days', e.intake_window_days
  )
  from public.events e
  where e.intake_token = p_token
$$;

-- migrate:down
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
