-- migrate:up
-- Proposals: everything the system recommends and a coordinator approves with one tap
-- (PRD principle P1, FR-PL-09). Notifications: in-app messages per recipient (FR-PL-08),
-- published to listeners with pg_notify for the real-time stream.

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  parent_id uuid references public.proposals (id) on delete cascade,
  kind public.proposal_kind not null,
  status public.proposal_status not null default 'pending',
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text check (char_length(summary) <= 2000),
  rationale jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  target_type text check (target_type ~ '^[a-z_]{1,50}$'),
  target_id uuid,
  created_by_type public.actor_type not null,
  created_by uuid references public.profiles (id),
  trigger_type text check (char_length(trigger_type) <= 50),
  trigger_id text check (char_length(trigger_id) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_note text check (char_length(decision_note) <= 2000),
  superseded_by uuid references public.proposals (id),
  execution_error text,
  -- Every transition out of pending records when it happened.
  constraint proposals_decided_when_closed check ((status = 'pending') = (decided_at is null))
);

create index proposals_pending_idx on public.proposals (created_at) where status = 'pending';
create index proposals_pending_target_idx on public.proposals (target_type, target_id)
  where status = 'pending';
create index proposals_parent_idx on public.proposals (parent_id);

alter table public.audit_log
  add constraint audit_log_proposal_id_fkey foreign key (proposal_id) references public.proposals (id);

create trigger set_updated_at before update on public.proposals
  for each row execute function private.set_updated_at();
select private.attach_audit('public.proposals');
select private.enable_rls('public.proposals');

-- Read-only for coordinators; every write goes through the functions below.
grant select on public.proposals to vip_app;
create policy proposals_select on public.proposals for select to vip_app
  using ((select private.is_coordinator_plus()));

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid default private.current_event_id() references public.events (id),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]{1,49}$'),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text check (char_length(body) <= 2000),
  entity_type text check (entity_type ~ '^[a-z_]{1,50}$'),
  entity_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

select private.enable_rls('public.notifications');
grant select on public.notifications to vip_app;
grant update (read_at) on public.notifications to vip_app;
create policy notifications_select_own on public.notifications for select to vip_app
  using (recipient_id = (select private.current_user_id()));
create policy notifications_update_own on public.notifications for update to vip_app
  using (recipient_id = (select private.current_user_id()))
  with check (recipient_id = (select private.current_user_id()));

-- Wakes the API's LISTEN connection, which pushes the notification over Server-Sent Events.
create function private.publish_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_notify(
    'vip_notifications',
    pg_catalog.json_build_object(
      'id', new.id,
      'recipient_id', new.recipient_id,
      'kind', new.kind,
      'priority', new.priority
    )::text
  );
  return null;
end
$$;

create trigger publish_notification after insert on public.notifications
  for each row execute function private.publish_notification();

-- Notification fan-out ------------------------------------------------------------------

create function private.notify_users(
  p_recipient_ids uuid[],
  p_kind text,
  p_title text,
  p_body text default null,
  p_priority text default 'normal',
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with inserted as (
    insert into public.notifications (recipient_id, kind, priority, title, body, entity_type, entity_id)
    select distinct r.id, p_kind, p_priority, p_title, p_body, p_entity_type, p_entity_id
    from pg_catalog.unnest(p_recipient_ids) as r (id)
    where r.id is not null
    returning 1
  )
  select count(*)::integer from inserted
$$;

-- Notifies every active account holding one of the roles.
create function private.notify_roles(
  p_roles public.app_role[],
  p_kind text,
  p_title text,
  p_body text default null,
  p_priority text default 'normal',
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select private.notify_users(
    array(
      select p.id from public.profiles p
      where p.role = any (p_roles) and not p.banned
    ),
    p_kind, p_title, p_body, p_priority, p_entity_type, p_entity_id
  )
$$;

grant execute on function private.notify_users(uuid[], text, text, text, text, text, uuid) to vip_system;
grant execute on function private.notify_roles(public.app_role[], text, text, text, text, text, uuid) to vip_system;

-- Proposal lifecycle ---------------------------------------------------------------------

-- Creates a proposal, supersedes older pending proposals for the same target and tells the
-- coordinators. Used by system jobs (vip_system) and, from P7, by Co-Pilot write tools.
create function private.create_proposal(
  p_kind public.proposal_kind,
  p_title text,
  p_payload jsonb,
  p_created_by_type public.actor_type,
  p_summary text default null,
  p_rationale jsonb default '{}'::jsonb,
  p_target_type text default null,
  p_target_id uuid default null,
  p_trigger_type text default null,
  p_trigger_id text default null,
  p_parent_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.set_audit_context(
    p_actor_type => p_created_by_type,
    p_action => 'proposals.create',
    p_is_automatic => p_created_by_type = 'system',
    p_undoable => false
  );

  insert into public.proposals (
    kind, title, summary, rationale, payload, target_type, target_id, created_by_type,
    created_by, trigger_type, trigger_id, parent_id, expires_at
  )
  values (
    p_kind, p_title, p_summary, p_rationale, p_payload, p_target_type, p_target_id,
    p_created_by_type, private.current_user_id(), p_trigger_type, p_trigger_id, p_parent_id,
    p_expires_at
  )
  returning id into v_id;

  if p_parent_id is null and p_target_id is not null then
    perform private.set_audit_context(
      p_actor_type => p_created_by_type,
      p_action => 'proposals.supersede',
      p_is_automatic => p_created_by_type = 'system',
      p_undoable => false
    );
    -- Older pending proposals for the same target, and their pending lines.
    with superseded as (
      update public.proposals
      set status = 'superseded', decided_at = pg_catalog.now(), superseded_by = v_id
      where status = 'pending'
        and parent_id is null
        and target_type = p_target_type
        and target_id = p_target_id
        and id <> v_id
      returning id
    )
    update public.proposals line
    set status = 'superseded', decided_at = pg_catalog.now(), superseded_by = v_id
    from superseded
    where line.parent_id = superseded.id and line.status = 'pending';
  end if;

  if p_parent_id is null then
    perform private.notify_roles(
      array['coordinator', 'admin', 'super_admin']::public.app_role[],
      'proposal_created', p_title, p_summary, 'normal', 'proposals', v_id
    );
  end if;

  perform private.clear_audit_context();
  return v_id;
end
$$;
grant execute on function private.create_proposal(
  public.proposal_kind, text, jsonb, public.actor_type, text, jsonb, text, uuid, text, text, uuid, timestamptz
) to vip_system;

-- Locks a proposal for a decision and checks it is still open.
create function private.lock_pending_proposal(p_proposal_id uuid)
returns public.proposals
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
begin
  if not private.is_coordinator_plus() then
    raise exception 'Only coordinators can decide on proposals' using errcode = '42501', hint = 'forbidden';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposal % not found', p_proposal_id using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'This proposal is already %', v_proposal.status
      using errcode = '55000', hint = 'not_pending',
        detail = pg_catalog.jsonb_build_object('status', v_proposal.status)::text;
  end if;
  return v_proposal;
end
$$;

create function public.reject_proposal(p_proposal_id uuid, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.lock_pending_proposal(p_proposal_id);

  perform private.set_audit_context(p_action => 'proposals.reject', p_reason => p_note);
  update public.proposals
  set status = 'rejected',
      decided_at = pg_catalog.now(),
      decided_by = private.current_user_id(),
      decision_note = p_note
  where id = p_proposal_id
     or (parent_id = p_proposal_id and status = 'pending');
  perform private.clear_audit_context();

  return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'rejected');
end
$$;

-- Approval re-validates and executes the proposal's payload. Executors arrive with their
-- modules: room_* (P4), driver_* and release_pickup (P3), copilot_action (P7).
create function public.approve_proposal(p_proposal_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
begin
  v_proposal := private.lock_pending_proposal(p_proposal_id);

  if v_proposal.expires_at is not null and v_proposal.expires_at <= pg_catalog.now() then
    perform private.set_audit_context(p_action => 'proposals.expire');
    update public.proposals
    set status = 'expired', decided_at = pg_catalog.now()
    where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'expired');
  end if;

  raise exception 'Approving % proposals is not available yet', v_proposal.kind
    using errcode = '0A000', hint = 'not_implemented';
end
$$;

grant execute on function public.reject_proposal(uuid, text) to vip_app;
grant execute on function public.approve_proposal(uuid, uuid[]) to vip_app;

-- migrate:down
drop function if exists public.approve_proposal(uuid, uuid[]);
drop function if exists public.reject_proposal(uuid, text);
drop function if exists private.lock_pending_proposal(uuid);
drop function if exists private.create_proposal(
  public.proposal_kind, text, jsonb, public.actor_type, text, jsonb, text, uuid, text, text, uuid, timestamptz
);
drop function if exists private.notify_roles(public.app_role[], text, text, text, text, text, uuid);
drop function if exists private.notify_users(uuid[], text, text, text, text, text, uuid);
drop table if exists public.notifications;
drop function if exists private.publish_notification();
alter table public.audit_log drop constraint if exists audit_log_proposal_id_fkey;
drop table if exists public.proposals;
