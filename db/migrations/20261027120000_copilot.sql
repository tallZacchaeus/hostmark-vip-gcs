-- migrate:up
-- Co-Pilot (P7, FR-CP-04/06): write actions become proposals that a coordinator approves (never
-- written by the Co-Pilot itself), approving a Co-Pilot note writes it, and every exchange is logged.

create table public.copilot_exchanges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null default private.current_event_id() references public.events (id),
  user_id uuid not null default private.current_user_id() references public.profiles (id) on delete cascade,
  conversation_id uuid not null,
  question text not null check (char_length(question) between 1 and 2000),
  input_mode text not null default 'text' check (input_mode in ('text', 'voice')),
  -- The speech recognizer's words before the coordinator edited them (voice only, for the WER metric).
  transcript_original text check (char_length(transcript_original) <= 2000),
  engine text not null check (char_length(engine) <= 50),
  intent text check (char_length(intent) <= 50),
  tools jsonb not null default '[]'::jsonb,
  answer text not null check (char_length(answer) <= 8000),
  citations jsonb not null default '[]'::jsonb,
  proposal_id uuid references public.proposals (id) on delete set null,
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);
create index copilot_exchanges_user_idx on public.copilot_exchanges (user_id, created_at desc);
select private.enable_rls('public.copilot_exchanges');

-- Coordinators log their own exchanges; each reads their own, Admin reads all (evaluation, audit).
grant select on public.copilot_exchanges to vip_app;
grant insert (conversation_id, question, input_mode, transcript_original, engine, intent, tools, answer, citations, proposal_id, latency_ms)
  on public.copilot_exchanges to vip_app;
create policy copilot_exchanges_select on public.copilot_exchanges for select to vip_app
  using (user_id = (select private.current_user_id()) or (select private.is_admin_plus()));
create policy copilot_exchanges_insert on public.copilot_exchanges for insert to vip_app
  with check ((select private.is_coordinator_plus()) and user_id = (select private.current_user_id()));

-- Co-Pilot write tools (FR-CP-04) ---------------------------------------------------------------

-- Creates a proposal on the coordinator's behalf, marked as the Co-Pilot's. Only the agreed actions:
-- a room move (room_assignment), a driver (re)assignment, or a note (copilot_action add_note). The
-- executors re-check everything at approval. A note has no target, so it supersedes nothing.
create function public.copilot_propose(
  p_kind public.proposal_kind, p_payload jsonb, p_title text, p_summary text, p_target_type text, p_target_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_valid boolean;
  v_note text := pg_catalog.btrim(coalesce(p_payload ->> 'detail', ''));
begin
  if not private.is_coordinator_plus() then
    raise exception 'Only coordinators can ask the Co-Pilot to propose changes' using errcode = '42501', hint = 'forbidden';
  end if;
  -- The target must be the record the payload acts on (so only its own older suggestions are
  -- superseded), one driver at a time, and a small payload.
  v_valid := pg_catalog.pg_column_size(p_payload) < 4096 and case p_kind
    when 'room_assignment' then p_payload ? 'room_id' and p_target_type = 'guests' and p_payload ->> 'guest_id' = p_target_id::text
    when 'driver_assignment' then p_target_type = 'pickups' and p_payload ->> 'pickup_id' = p_target_id::text
      and pg_catalog.jsonb_typeof(p_payload -> 'driver_ids') = 'array' and pg_catalog.jsonb_array_length(p_payload -> 'driver_ids') = 1
    when 'driver_reassignment' then p_target_type = 'pickups' and p_payload ->> 'pickup_id' = p_target_id::text
      and pg_catalog.jsonb_typeof(p_payload -> 'driver_ids') = 'array' and pg_catalog.jsonb_array_length(p_payload -> 'driver_ids') = 1
    when 'copilot_action' then p_payload ->> 'action' = 'add_note' and p_payload ->> 'guest_id' = p_target_id::text
      and pg_catalog.char_length(v_note) between 1 and 1000
    else false
  end;
  if not coalesce(v_valid, false) or p_title is null or pg_catalog.char_length(p_title) not between 1 and 200 then
    raise exception 'The Co-Pilot cannot propose that' using errcode = '22023', hint = 'invalid_action';
  end if;
  return private.create_proposal(
    p_kind => p_kind,
    p_title => p_title,
    p_payload => p_payload,
    p_created_by_type => 'copilot',
    p_summary => p_summary,
    p_target_type => case when p_kind = 'copilot_action' then null else p_target_type end,
    p_target_id => case when p_kind = 'copilot_action' then null else p_target_id end
  );
end
$$;
grant execute on function public.copilot_propose(public.proposal_kind, jsonb, text, text, text, uuid) to vip_app;

-- copilot_action add_note: the note becomes a coordinator note on the guest.
create function private.execute_copilot_action(p_proposal public.proposals)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guest_id uuid;
  v_detail text := pg_catalog.btrim(coalesce(p_proposal.payload ->> 'detail', ''));
begin
  if p_proposal.payload ->> 'action' is distinct from 'add_note' or pg_catalog.char_length(v_detail) not between 1 and 1000 then
    return pg_catalog.jsonb_build_object('error', 'invalid_payload');
  end if;
  begin
    v_guest_id := (p_proposal.payload ->> 'guest_id')::uuid;
  exception when invalid_text_representation then
    return pg_catalog.jsonb_build_object('error', 'invalid_payload');
  end;
  perform 1 from public.guests where id = v_guest_id and status <> 'cancelled' for update;
  if not found then
    return pg_catalog.jsonb_build_object('error', 'guest_gone');
  end if;
  insert into public.guest_requirements (guest_id, category, detail, source)
  values (v_guest_id, 'other', v_detail, 'coordinator');
  return pg_catalog.jsonb_build_object('guest_id', v_guest_id);
end
$$;

-- The P4 approve_proposal, now also executing Co-Pilot notes.
create or replace function public.approve_proposal(p_proposal_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
  v_result jsonb;
begin
  v_proposal := private.lock_pending_proposal(p_proposal_id);

  if v_proposal.parent_id is not null then
    raise exception 'Decide this line through its plan' using errcode = '55000', hint = 'is_line';
  end if;

  if v_proposal.expires_at is not null and v_proposal.expires_at <= pg_catalog.now() then
    perform private.set_audit_context(p_action => 'proposals.expire');
    update public.proposals
    set status = 'expired', decided_at = pg_catalog.now()
    where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'expired');
  end if;

  perform private.set_audit_context(p_action => 'proposals.execute', p_proposal_id => p_proposal_id);
  if v_proposal.kind = 'room_plan' then
    v_result := private.execute_room_plan(v_proposal, p_line_ids);
    perform private.set_audit_context(p_action => 'proposals.approve', p_proposal_id => p_proposal_id);
    update public.proposals
    set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
    where id = p_proposal_id;
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'approved') || v_result;
  end if;

  v_result := case
    when v_proposal.kind = 'release_pickup' then private.execute_release_pickup(v_proposal)
    when v_proposal.kind = 'room_assignment' then private.execute_room_assignment(v_proposal)
    when v_proposal.kind = 'copilot_action' then private.execute_copilot_action(v_proposal)
    else private.execute_driver_proposal(v_proposal)
  end;

  if v_result ? 'error' then
    perform private.set_audit_context(p_action => 'proposals.fail', p_proposal_id => p_proposal_id);
    update public.proposals
    set status = 'failed', decided_at = pg_catalog.now(), decided_by = private.current_user_id(),
        execution_error = v_result ->> 'error'
    where id = p_proposal_id;
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'failed', 'error', v_result ->> 'error');
  end if;

  perform private.set_audit_context(p_action => 'proposals.approve', p_proposal_id => p_proposal_id);
  update public.proposals
  set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
  where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'approved') || v_result;
end
$$;

-- migrate:down
-- approve_proposal returns to its P4 form (Co-Pilot actions answer "not available yet").
create or replace function public.approve_proposal(p_proposal_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
  v_result jsonb;
begin
  v_proposal := private.lock_pending_proposal(p_proposal_id);

  if v_proposal.parent_id is not null then
    raise exception 'Decide this line through its plan' using errcode = '55000', hint = 'is_line';
  end if;

  if v_proposal.expires_at is not null and v_proposal.expires_at <= pg_catalog.now() then
    perform private.set_audit_context(p_action => 'proposals.expire');
    update public.proposals
    set status = 'expired', decided_at = pg_catalog.now()
    where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'expired');
  end if;

  if v_proposal.kind = 'copilot_action' then
    raise exception 'Approving % proposals is not available yet', v_proposal.kind
      using errcode = '0A000', hint = 'not_implemented';
  end if;

  perform private.set_audit_context(p_action => 'proposals.execute', p_proposal_id => p_proposal_id);
  if v_proposal.kind = 'room_plan' then
    v_result := private.execute_room_plan(v_proposal, p_line_ids);
    perform private.set_audit_context(p_action => 'proposals.approve', p_proposal_id => p_proposal_id);
    update public.proposals
    set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
    where id = p_proposal_id;
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'approved') || v_result;
  end if;

  v_result := case
    when v_proposal.kind = 'release_pickup' then private.execute_release_pickup(v_proposal)
    when v_proposal.kind = 'room_assignment' then private.execute_room_assignment(v_proposal)
    else private.execute_driver_proposal(v_proposal)
  end;

  if v_result ? 'error' then
    perform private.set_audit_context(p_action => 'proposals.fail', p_proposal_id => p_proposal_id);
    update public.proposals
    set status = 'failed', decided_at = pg_catalog.now(), decided_by = private.current_user_id(),
        execution_error = v_result ->> 'error'
    where id = p_proposal_id;
    perform private.clear_audit_context();
    return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'failed', 'error', v_result ->> 'error');
  end if;

  perform private.set_audit_context(p_action => 'proposals.approve', p_proposal_id => p_proposal_id);
  update public.proposals
  set status = 'approved', decided_at = pg_catalog.now(), decided_by = private.current_user_id()
  where id = p_proposal_id or (parent_id = p_proposal_id and status = 'pending');
  perform private.clear_audit_context();
  return pg_catalog.jsonb_build_object('id', p_proposal_id, 'status', 'approved') || v_result;
end
$$;

drop function if exists private.execute_copilot_action(public.proposals);
drop function if exists public.copilot_propose(public.proposal_kind, jsonb, text, text, text, uuid);
drop table if exists public.copilot_exchanges;
