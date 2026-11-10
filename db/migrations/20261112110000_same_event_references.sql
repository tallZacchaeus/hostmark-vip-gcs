-- migrate:up
-- P9 step 9.6 (06-Implementation-Plan.md; security review of 9.2–9.3, finding MED 4): a row may
-- only reference records of its own event. Row-level security checks a row's own event_id, not the
-- event of the rows it points at, so a known id from another event could otherwise be linked in
-- (event A's assignment naming event B's room). Ids inside Victoria's proposal payloads are covered
-- too: approving a proposal writes ordinary rows, which pass through these checks.
--
-- One generic trigger, attached by a loop to every table with a foreign key to an event table
-- (a table with an event_id column). It compares the row's own event_id (if it has one) with the
-- event of each referenced row; link tables without event_id (program_participants, driver_shifts)
-- compare their referenced rows with each other.

create function private.check_same_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := pg_catalog.to_jsonb(new);
  v_event uuid := (v_row ->> 'event_id')::uuid;
  v_ref text;
  v_ref_event uuid;
  i int := 0;
begin
  -- Arguments come in pairs: the referencing column, then the referenced table. The id is passed
  -- as a quoted literal so it takes the referenced key's own type (uuid, or bigint for audit_log).
  while i < tg_nargs loop
    v_ref := v_row ->> tg_argv[i];
    if v_ref is not null then
      execute pg_catalog.format('select event_id from public.%I where id = %L', tg_argv[i + 1], v_ref)
        into v_ref_event;
      if v_ref_event is not null then
        if v_event is null then
          v_event := v_ref_event;
        elsif v_ref_event <> v_event then
          raise exception 'A record from another event cannot be used here'
            using errcode = '23503', hint = 'cross_event_reference';
        end if;
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end
$$;
revoke all on function private.check_same_event() from public;

do $$
declare
  v_table record;
  v_columns text;
begin
  for v_table in
    select c.conrelid::regclass as tbl,
           pg_catalog.string_agg(pg_catalog.format('%L, %L', a.attname, r.relname), ', ' order by a.attname) as args,
           pg_catalog.string_agg(pg_catalog.quote_ident(a.attname), ', ' order by a.attname) as columns,
           pg_catalog.count(*) as refs,
           exists (
             select 1 from pg_catalog.pg_attribute e
             where e.attrelid = c.conrelid and e.attname = 'event_id' and not e.attisdropped
           ) as has_event
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid = c.confrelid
    join pg_catalog.pg_namespace n on n.oid = r.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and pg_catalog.cardinality(c.conkey) = 1
      and n.nspname = 'public'
      and r.relname <> 'events'
      and exists (
        select 1 from pg_catalog.pg_attribute re
        where re.attrelid = c.confrelid and re.attname = 'event_id' and not re.attisdropped
      )
    group by c.conrelid
  loop
    -- Nothing to compare: one reference and no event_id of its own.
    continue when not v_table.has_event and v_table.refs < 2;
    v_columns := v_table.columns || case when v_table.has_event then ', event_id' else '' end;
    execute pg_catalog.format(
      'create trigger same_event_refs before insert or update of %s on %s
         for each row execute function private.check_same_event(%s)',
      v_columns, v_table.tbl, v_table.args);
  end loop;
end
$$;

-- The trigger covers single-column foreign keys (every one today). A composite foreign key into an
-- event table would be skipped silently, so refuse to migrate until it is handled here.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid = c.confrelid
    join pg_catalog.pg_namespace n on n.oid = r.relnamespace
    where c.contype = 'f' and pg_catalog.cardinality(c.conkey) > 1 and n.nspname = 'public'
      and exists (
        select 1 from pg_catalog.pg_attribute re
        where re.attrelid = c.confrelid and re.attname = 'event_id' and not re.attisdropped
      )
  ) then
    raise exception 'A composite foreign key into an event table needs a same-event check';
  end if;
end
$$;

-- migrate:down
do $$
declare
  v_table regclass;
begin
  for v_table in select t.tgrelid::regclass from pg_catalog.pg_trigger t where t.tgname = 'same_event_refs' loop
    execute pg_catalog.format('drop trigger same_event_refs on %s', v_table);
  end loop;
end
$$;
drop function if exists private.check_same_event();
