-- migrate:up
-- Append-only audit log, a generic row-change trigger and undo (FR-PL-07, PRD principle P2).
--
-- Every audited table gets the trigger "audit_row_change" (via private.attach_audit). The actor
-- comes from app.user_id; system work sets app.actor_type through private.set_audit_context.

create table public.audit_log (
  id bigint generated always as identity primary key,
  event_id uuid references public.events (id),
  occurred_at timestamptz not null default now(),
  actor_type public.actor_type not null,
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  reason text,
  proposal_id uuid,
  is_automatic boolean not null default false,
  undoable boolean not null default false,
  -- Unique: an entry can be undone at most once, even under concurrent requests.
  undo_of_audit_id bigint unique references public.audit_log (id)
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, id desc);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);

select private.enable_rls('public.audit_log');
-- Append-only: vip_system may insert and read, never update or delete.
revoke update, delete on public.audit_log from vip_system;
grant select on public.audit_log to vip_app;
create policy audit_log_select on public.audit_log for select to vip_app
  using ((select private.is_coordinator_plus()));

-- Audit context (transaction-local settings) ------------------------------------------

create function private.set_audit_context(
  p_actor_type public.actor_type default null,
  p_action text default null,
  p_reason text default null,
  p_proposal_id uuid default null,
  p_is_automatic boolean default null,
  p_undoable boolean default null,
  p_undo_of_audit_id bigint default null
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('app.actor_type', coalesce(p_actor_type::text, ''), true);
  perform pg_catalog.set_config('app.audit_action', coalesce(p_action, ''), true);
  perform pg_catalog.set_config('app.audit_reason', coalesce(p_reason, ''), true);
  perform pg_catalog.set_config('app.proposal_id', coalesce(p_proposal_id::text, ''), true);
  perform pg_catalog.set_config('app.is_automatic', coalesce(p_is_automatic::text, ''), true);
  perform pg_catalog.set_config('app.undoable', coalesce(p_undoable::text, ''), true);
  perform pg_catalog.set_config('app.undo_of_audit_id', coalesce(p_undo_of_audit_id::text, ''), true);
end
$$;

create function private.clear_audit_context()
returns void
language sql
volatile
set search_path = ''
as $$
  select private.set_audit_context()
$$;

-- Not granted to vip_app: the API must not be able to forge the recorded actor.
grant execute on function private.set_audit_context(
  public.actor_type, text, text, uuid, boolean, boolean, bigint
) to vip_system;
grant execute on function private.clear_audit_context() to vip_system;

-- Generic trigger ----------------------------------------------------------------------

-- Optional argument 'skip_anonymous': ignore writes that carry no actor at all. Used for
-- profiles, which Better Auth writes on the system connection; the API records those
-- account changes explicitly (private.audit_profile_change) with the acting admin.
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id();
  v_actor_setting text := nullif(pg_catalog.current_setting('app.actor_type', true), '');
  v_actor_type public.actor_type;
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_is_automatic boolean;
begin
  if tg_nargs > 0 and tg_argv[0] = 'skip_anonymous'
     and v_user_id is null and v_actor_setting is null then
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_before := pg_catalog.to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := pg_catalog.to_jsonb(new);
  end if;

  -- An update that changed nothing but updated_at is not worth an entry.
  if tg_op = 'UPDATE' and (v_before - 'updated_at') = (v_after - 'updated_at') then
    return null;
  end if;

  v_actor_type := coalesce(
    v_actor_setting::public.actor_type,
    case when v_user_id is null then 'system'::public.actor_type else 'user'::public.actor_type end
  );
  v_is_automatic := coalesce(
    nullif(pg_catalog.current_setting('app.is_automatic', true), '')::boolean,
    v_actor_type = 'system'
  );
  v_row := coalesce(v_after, v_before);

  insert into public.audit_log (
    event_id, actor_type, actor_id, action, entity_type, entity_id, before, after,
    reason, proposal_id, is_automatic, undoable, undo_of_audit_id
  )
  values (
    coalesce(
      (v_row ->> 'event_id')::uuid,
      case when tg_table_name = 'events' then (v_row ->> 'id')::uuid end,
      private.current_event_id()
    ),
    v_actor_type,
    v_user_id,
    coalesce(
      nullif(pg_catalog.current_setting('app.audit_action', true), ''),
      tg_table_name || '.' || pg_catalog.lower(tg_op)
    ),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_before,
    v_after,
    nullif(pg_catalog.current_setting('app.audit_reason', true), ''),
    nullif(pg_catalog.current_setting('app.proposal_id', true), '')::uuid,
    v_is_automatic,
    coalesce(nullif(pg_catalog.current_setting('app.undoable', true), '')::boolean, v_is_automatic),
    nullif(pg_catalog.current_setting('app.undo_of_audit_id', true), '')::bigint
  );

  return null;
end
$$;

-- Called from migrations only.
create function private.attach_audit(p_table regclass, p_skip_anonymous boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute pg_catalog.format(
    'create trigger audit_row_change after insert or update or delete on %s '
    'for each row execute function private.audit_row_change(%s)',
    p_table,
    case when p_skip_anonymous then pg_catalog.quote_literal('skip_anonymous') else '' end
  );
end
$$;

select private.attach_audit('public.events');
select private.attach_audit('public.profiles', p_skip_anonymous => true);

-- Explicit entry for account changes made through Better Auth on the system connection
-- (create user, reset password). Records the acting admin as the actor.
create function private.audit_profile_change(
  p_profile_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_after jsonb;
begin
  if not private.is_admin_plus() then
    raise exception 'Only an Admin or Super Admin can manage accounts'
      using errcode = '42501', hint = 'forbidden';
  end if;
  if p_action not in ('profiles.create', 'profiles.password_reset') then
    raise exception 'Unsupported account audit action %', p_action using errcode = '22023';
  end if;

  select pg_catalog.to_jsonb(p) into v_after from public.profiles p where p.id = p_profile_id;
  if v_after is null then
    raise exception 'Account % not found', p_profile_id using errcode = 'P0002', hint = 'not_found';
  end if;
  -- Same rule as profiles_update: only a Super Admin manages Admin and Super Admin accounts.
  if v_after ->> 'role' in ('admin', 'super_admin') and not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can manage this account' using errcode = '42501', hint = 'forbidden';
  end if;

  insert into public.audit_log (
    event_id, actor_type, actor_id, action, entity_type, entity_id, before, after, reason
  )
  values (
    private.current_event_id(), 'user', private.current_user_id(), p_action, 'profiles',
    p_profile_id, null, v_after, p_reason
  );
end
$$;
grant execute on function private.audit_profile_change(uuid, text, text) to vip_app;

-- Undo (F10 in 03-App-Flow.md) ------------------------------------------------------------

-- Reverts an undoable entry, but only if the record still looks exactly like the entry left
-- it. Otherwise it refuses with "Changed since by <who> at <when>".
create function public.undo_audit_entry(p_audit_id bigint, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry public.audit_log;
  v_table regclass;
  v_op text;
  v_matches boolean;
  v_latest public.audit_log;
  v_latest_by text;
  v_set_list text;
  v_column_list text;
begin
  if not private.is_coordinator_plus() then
    raise exception 'Only coordinators can undo actions' using errcode = '42501', hint = 'forbidden';
  end if;

  select * into v_entry from public.audit_log where id = p_audit_id;
  if not found then
    raise exception 'Activity entry % not found', p_audit_id using errcode = 'P0002', hint = 'not_found';
  end if;
  if not v_entry.undoable then
    raise exception 'This action cannot be undone' using errcode = '55000', hint = 'not_undoable';
  end if;
  if exists (select 1 from public.audit_log a where a.undo_of_audit_id = p_audit_id) then
    raise exception 'This action has already been undone' using errcode = '55000', hint = 'already_undone';
  end if;

  -- Undo runs as the table owner (bypassing RLS), so it is limited to operational tables a
  -- coordinator may change anyway. Accounts, event settings and proposals are never undone.
  -- Add each new operational table here explicitly.
  v_table := pg_catalog.to_regclass(pg_catalog.format('public.%I', v_entry.entity_type));
  if v_entry.entity_type not in ('room_types', 'rooms', 'drivers', 'driver_shifts', 'vip_categories')
     or v_table is null or not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = v_table and t.tgname = 'audit_row_change'
  ) then
    raise exception 'Changes to % cannot be undone', v_entry.entity_type
      using errcode = '55000', hint = 'not_undoable';
  end if;

  v_op := case
    when v_entry.before is null then 'insert'
    when v_entry.after is null then 'delete'
    else 'update'
  end;

  -- Lock the row and compare it with the state the entry produced. updated_at is ignored, as in
  -- the audit trigger: a write that changed nothing else is not a change.
  if v_op = 'delete' then
    execute pg_catalog.format('select not exists (select 1 from %s t where t.id = $1)', v_table)
      into v_matches using v_entry.entity_id;
  else
    execute pg_catalog.format(
      'select (pg_catalog.to_jsonb(t) - ''updated_at'') = '
      '(pg_catalog.to_jsonb(pg_catalog.jsonb_populate_record(null::%1$s, $2)) - ''updated_at'') '
      'from %1$s t where t.id = $1 for update',
      v_table
    ) into v_matches using v_entry.entity_id, v_entry.after;
  end if;

  if not coalesce(v_matches, false) then
    select * into v_latest from public.audit_log a
    where a.entity_type = v_entry.entity_type and a.entity_id = v_entry.entity_id and a.id > v_entry.id
    order by a.id desc
    limit 1;
    select p.full_name into v_latest_by from public.profiles p where p.id = v_latest.actor_id;

    raise exception 'Changed since by % at %; edit it manually instead',
      coalesce(v_latest_by, v_latest.actor_type::text, 'someone'),
      coalesce(v_latest.occurred_at::text, 'an unknown time')
      using errcode = '55000', hint = 'undo_conflict',
        detail = pg_catalog.jsonb_build_object(
          'changed_by', v_latest_by,
          'changed_by_type', v_latest.actor_type,
          'changed_at', v_latest.occurred_at
        )::text;
  end if;

  select
    pg_catalog.string_agg(pg_catalog.format('%I = r.%I', a.attname, a.attname), ', ')
      filter (where a.attname <> 'id'),
    pg_catalog.string_agg(pg_catalog.format('%I', a.attname), ', ')
  into v_set_list, v_column_list
  from pg_catalog.pg_attribute a
  where a.attrelid = v_table
    and a.attnum > 0
    and not a.attisdropped
    and a.attgenerated = ''
    and a.attidentity = '';

  perform private.set_audit_context(
    p_actor_type => 'user',
    p_action => v_entry.entity_type || '.undo',
    p_reason => p_reason,
    p_is_automatic => false,
    p_undoable => false,
    p_undo_of_audit_id => p_audit_id
  );

  begin
    if v_op = 'insert' then
      execute pg_catalog.format('delete from %s where id = $1', v_table) using v_entry.entity_id;
    elsif v_op = 'update' then
      execute pg_catalog.format(
        'update %1$s t set %2$s from pg_catalog.jsonb_populate_record(null::%1$s, $1) r where t.id = $2',
        v_table, v_set_list
      ) using v_entry.before, v_entry.entity_id;
    else
      execute pg_catalog.format(
        'insert into %1$s (%2$s) select %2$s from pg_catalog.jsonb_populate_record(null::%1$s, $1)',
        v_table, v_column_list
      ) using v_entry.before;
    end if;
  exception
    when foreign_key_violation or unique_violation or exclusion_violation or check_violation then
      raise exception 'This cannot be undone because related records have changed; edit it manually instead'
        using errcode = '55000', hint = 'undo_conflict';
  end;

  perform private.clear_audit_context();

  return pg_catalog.jsonb_build_object(
    'undone_audit_id', p_audit_id,
    'entity_type', v_entry.entity_type,
    'entity_id', v_entry.entity_id
  );
end
$$;
grant execute on function public.undo_audit_entry(bigint, text) to vip_app;

-- migrate:down
drop function if exists public.undo_audit_entry(bigint, text);
drop function if exists private.audit_profile_change(uuid, text, text);
drop trigger if exists audit_row_change on public.profiles;
drop trigger if exists audit_row_change on public.events;
drop function if exists private.attach_audit(regclass, boolean);
drop function if exists private.audit_row_change();
drop function if exists private.clear_audit_context();
drop function if exists private.set_audit_context(public.actor_type, text, text, uuid, boolean, boolean, bigint);
drop table if exists public.audit_log;
