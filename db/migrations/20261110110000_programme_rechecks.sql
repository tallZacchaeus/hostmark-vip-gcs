-- migrate:up
-- Programme re-checks (P6 follow-up): the at-risk flag depends on the event's lead time, so changing
-- it re-checks every item of the event at once, with the usual rules (a published item that becomes
-- at risk alerts; the flag and "team notified" clear by themselves).

create function private.program_lead_time_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item uuid;
begin
  -- In id order, so concurrent re-checks lock items in the same order.
  for v_item in select i.id from public.program_items i where i.event_id = new.id order by i.id loop
    perform private.refresh_program_risk(v_item);
  end loop;
  return null;
end
$$;
create trigger program_lead_time_changed after update of program_lead_time_min on public.events
  for each row when (old.program_lead_time_min is distinct from new.program_lead_time_min)
  execute function private.program_lead_time_changed();

-- migrate:down
drop trigger if exists program_lead_time_changed on public.events;
drop function if exists private.program_lead_time_changed();
