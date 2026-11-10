-- migrate:up
-- P9 step 9.3 (06-Implementation-Plan.md): choosing the event a person works in.
--   * An installation's first event takes in everyone already on staff (as before P9, when the one
--     event was everyone's); later events start with their owner only and add people explicitly.
--   * public.my_events(): the events the signed-in person works on, for the event switcher.
--   * public.set_active_event(): switch to one of them (remembered in profiles.active_event_id,
--     which private.current_event_id() reads when the request names no event).

create function private.join_first_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select pg_catalog.count(*) from public.events) = 1 then
    insert into public.event_members (event_id, profile_id)
    select new.id, p.id from public.profiles p
    where p.role <> 'super_admin' and p.id is distinct from new.owner_id
    on conflict do nothing;
  end if;
  return null;
end
$$;
create trigger join_first_event after insert on public.events
  for each row execute function private.join_first_event();

create function public.my_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', e.id, 'name', e.name, 'status', e.status, 'starts_on', e.starts_on, 'ends_on', e.ends_on,
      'is_owner', e.owner_id = private.current_user_id(),
      'is_current', e.id = private.current_event_id()
    ) order by (e.status = 'live') desc, e.status = 'archived', e.starts_on desc, e.name), '[]'::jsonb)
  from public.events e
  where private.can_access_event(e.id)
$$;

create function public.set_active_event(p_event_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is null then
    raise exception 'Sign in with an active account' using errcode = '42501', hint = 'unauthenticated';
  end if;
  if p_event_id is null or not private.can_access_event(p_event_id) then
    raise exception 'Not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  update public.profiles set active_event_id = p_event_id where id = private.current_user_id();
  return p_event_id;
end
$$;

revoke all on function public.my_events() from public;
revoke all on function public.set_active_event(uuid) from public;
grant execute on function public.my_events() to vip_app;
grant execute on function public.set_active_event(uuid) to vip_app;

-- migrate:down
drop function if exists public.set_active_event(uuid);
drop function if exists public.my_events();
drop trigger if exists join_first_event on public.events;
drop function if exists private.join_first_event();
