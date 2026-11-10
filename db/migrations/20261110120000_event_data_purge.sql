-- migrate:up
-- Super Admin data export and post-event purge of guest personal data (01-PRD.md §3 "data
-- export/purge", 02-TRD.md §7 Privacy). Both run as the table owner (SECURITY DEFINER) after checking
-- the caller is an active Super Admin, and each leaves exactly one entry in the audit log.
--
-- Purge rules:
--   * Refused until the event's last day is over in the event's time zone (hint event_not_ended).
--     There is no exception for simulated flight mode: it is the default and is also used for real
--     events without a flight data provider, so it cannot tell demo data from real guests. A demo
--     database is purged by setting the event dates in the past first.
--   * The caller repeats the event name (case and surrounding spaces ignored) as confirmation.
--   * Names become pseudonyms ("Guest 1a2b3c4d", "Delegation 5e6f7a8b"); contact details, dietary,
--     accessibility, requirement text, notes, submission payloads and Co-Pilot questions/answers are
--     removed; share groups become opaque labels that still compare equal. Ids, counts, times, enums,
--     rooms, flights and statuses stay byte for byte, so evaluation figures reproduce.
--   * Free text that stays (notification and proposal titles and summaries, rationale texts, override
--     reasons, programme text, audit reasons) is redacted on a best-effort basis: only values under
--     free-text keys (private.purge_is_free_text) are touched, never ids, timestamps, enums or
--     numbers. Recorded guest, delegation and contact names and pickup addresses are replaced as
--     whole words (case-insensitive); first names and surnames of 3+ letters (titles excepted) are
--     replaced as whole, capitalised words; e-mail addresses and phone numbers (7+ digits, local or
--     international) are removed. A person mentioned some other way (a nickname, a misspelling)
--     is not recognised, which is why those fields are best effort.
--   * The pickup drop-off is normally the venue and is kept, apart from the same redaction.
--   * The audit log: the row entries the purge's own updates produce are deleted again in the same
--     transaction (they would hold the old values) and replaced by one "event.purge" entry; earlier
--     entries for guest data keep their shape but get the same anonymisation in before/after/reason.
--     Entries for tables that can be undone (rooms, room types, drivers, shifts, VIP categories),
--     accounts and the event itself are not touched, so undo keeps working.
--   * Work: one combined pattern per pass (compiled once and cached by Postgres); the API sets a
--     statement_timeout for the call (lib/services/event-data.ts), since a timeout set inside the
--     function would not apply to the statement already running.

-- Redaction helpers ---------------------------------------------------------------------------

-- Keys (at any depth of a row or JSON document) whose string values are free text.
create function private.purge_is_free_text(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_key = any (array[
    'title', 'summary', 'why', 'reason', 'text', 'name', 'full_name', 'contact_name', 'delegation', 'notes',
    'note', 'detail', 'description', 'message', 'body', 'question', 'answer', 'transcript_original',
    'override_reason', 'problem_note', 'review_note', 'decision_note', 'execution_error', 'location',
    'pickup_location', 'dropoff_location', 'pickup_address', 'conflicts_with', 'label', 'others',
    'accessibility', 'organisation', 'position', 'attention', 'also_changes'
  ])
$$;

-- A literal for a regular expression; any run of spaces matches any run of white space.
create function private.purge_regex_literal(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_text), '([.^$|?*+()\[\]{}\\-])', '\\\1', 'g'),
    '[[:space:]]+', '[[:space:]]+', 'g'
  )
$$;

-- The lookup key of a name: lower case, single spaces.
create function private.purge_key(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_text), '[[:space:]]+', ' ', 'g'))
$$;

-- Replaces each whole-word match of `p_pattern` with its alias from `p_aliases` (keyed by
-- private.purge_key), longest match first.
create function private.purge_replace_matches(p_text text, p_pattern text, p_aliases jsonb, p_flags text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_text;
  v_match text;
begin
  if p_pattern is null or v_text !~* p_pattern then
    return v_text;
  end if;
  for v_match in
    select d.found from (select distinct m[1] as found from pg_catalog.regexp_matches(p_text, p_pattern, 'g' || p_flags) as m) as d
    order by pg_catalog.char_length(d.found) desc, d.found
  loop
    v_text := pg_catalog.regexp_replace(
      v_text, '\y' || private.purge_regex_literal(v_match) || '\y',
      coalesce(p_aliases ->> private.purge_key(v_match), '[name removed]'), 'g' || p_flags
    );
  end loop;
  return v_text;
end
$$;

-- Free text with names, addresses, e-mail addresses and phone numbers removed.
create function private.purge_redact_text(p_text text, p_full text, p_tokens text, p_aliases jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_text;
begin
  if v_text is null or v_text = '' then
    return v_text;
  end if;
  v_text := pg_catalog.regexp_replace(v_text, '[^[:space:]@<>"(),;]+@[^[:space:]@<>"(),;]+\.[[:alpha:]]{2,}', '[email removed]', 'g');
  -- 7+ digits, optionally with spaces, dashes or brackets between them; never an ISO date.
  v_text := pg_catalog.regexp_replace(
    v_text, '\+?(?<![[:alnum:]])(?![0-9]{4}-[0-9]{2}-[0-9]{2})[0-9](?:[ ()-]{0,2}[0-9]){6,14}(?![0-9])', '[phone removed]', 'g'
  );
  -- Names last, so the pseudonyms they insert are never mistaken for phone numbers.
  v_text := private.purge_replace_matches(v_text, p_full, p_aliases, 'i');
  v_text := private.purge_replace_matches(v_text, p_tokens, p_aliases, 'c');
  return v_text;
end
$$;

-- The same for the free-text values inside a JSON document; everything else is returned as it was.
create function private.purge_redact_jsonb(p_value jsonb, p_full text, p_tokens text, p_aliases jsonb, p_free boolean default false)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'string' then
      if not p_free then
        return p_value;
      end if;
      return pg_catalog.to_jsonb(private.purge_redact_text(p_value #>> '{}', p_full, p_tokens, p_aliases));
    when 'object' then
      return coalesce(
        (select pg_catalog.jsonb_object_agg(
           e.key, private.purge_redact_jsonb(e.value, p_full, p_tokens, p_aliases, private.purge_is_free_text(e.key)))
         from pg_catalog.jsonb_each(p_value) as e),
        '{}'::jsonb
      );
    when 'array' then
      return coalesce(
        (select pg_catalog.jsonb_agg(private.purge_redact_jsonb(e.value, p_full, p_tokens, p_aliases, p_free) order by e.ordinality)
         from pg_catalog.jsonb_array_elements(p_value) with ordinality as e),
        '[]'::jsonb
      );
    else
      return p_value;
  end case;
end
$$;

-- Sets the overlay's keys on the row, but only keys the row already has.
create function private.purge_overlay(p_row jsonb, p_overlay jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_row || coalesce(
    (select pg_catalog.jsonb_object_agg(o.key, o.value) from pg_catalog.jsonb_each(p_overlay) as o where p_row ? o.key),
    '{}'::jsonb
  )
$$;

-- The anonymised form of one row of `p_table` (as JSON). Used for the live rows and for the
-- before/after values in the audit log, so both follow the same rules.
create function private.purge_scrub_row(p_table text, p_row jsonb, p_full text, p_tokens text, p_aliases jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_row jsonb;
  v_caps jsonb;
  v_cap record;
  v_removed constant jsonb := '"[removed]"'::jsonb;
begin
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' then
    return p_row;
  end if;
  v_row := private.purge_redact_jsonb(p_row, p_full, p_tokens, p_aliases);

  v_row := private.purge_overlay(v_row, case p_table
    when 'guests' then pg_catalog.jsonb_build_object(
      'full_name', case when p_row ->> 'full_name' is null then null
        else pg_catalog.to_jsonb('Guest ' || pg_catalog.left(p_row ->> 'id', 8)) end,
      'share_group', case when p_row ->> 'share_group' is null then null
        else pg_catalog.to_jsonb('Group ' || pg_catalog.left(pg_catalog.md5(p_row ->> 'share_group'), 8)) end,
      'title', null, 'organisation', null, 'position', null, 'phone', null, 'email', null,
      'accessibility', null, 'dietary', '[]'::jsonb, 'notes', null)
    when 'delegations' then pg_catalog.jsonb_build_object(
      'name', pg_catalog.to_jsonb('Delegation ' || pg_catalog.left(p_row ->> 'id', 8)),
      'contact_name', null, 'contact_email', null, 'contact_phone', null, 'notes', null)
    when 'guest_requirements' then pg_catalog.jsonb_build_object('detail', v_removed, 'conflicts_with', null)
    when 'intake_submissions' then pg_catalog.jsonb_build_object(
      'payload', '{}'::jsonb, 'normalized', null, 'extraction', null, 'review_note', null, 'client_ip_hash', null,
      'issues', coalesce(
        (select pg_catalog.jsonb_agg(case when pg_catalog.jsonb_typeof(i.value) = 'object' then i.value - 'message' else i.value end
           order by i.ordinality)
         from pg_catalog.jsonb_array_elements(
           case when pg_catalog.jsonb_typeof(p_row -> 'issues') = 'array' then p_row -> 'issues' else '[]'::jsonb end
         ) with ordinality as i),
        '[]'::jsonb))
    when 'arrivals' then pg_catalog.jsonb_build_object(
      'pickup_address', case when p_row ->> 'pickup_address' is null then null else v_removed end)
    when 'pickups' then pg_catalog.jsonb_build_object('notes', null)
      || case when p_row ->> 'kind' = 'location' then pg_catalog.jsonb_build_object('pickup_location', v_removed) else '{}'::jsonb end
    when 'proposals' then pg_catalog.jsonb_build_object(
      'decision_note', null,
      'payload', case when pg_catalog.jsonb_typeof(v_row -> 'payload') = 'object' then (v_row -> 'payload') - 'detail' else v_row -> 'payload' end)
      || case when p_row ->> 'kind' = 'copilot_action' then pg_catalog.jsonb_build_object('summary', null) else '{}'::jsonb end
    when 'copilot_exchanges' then pg_catalog.jsonb_build_object(
      'question', v_removed, 'answer', v_removed, 'transcript_original', null, 'citations', '[]'::jsonb,
      'tools', coalesce(
        (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', t.value -> 'name') order by t.ordinality)
         from pg_catalog.jsonb_array_elements(
           case when pg_catalog.jsonb_typeof(p_row -> 'tools') = 'array' then p_row -> 'tools' else '[]'::jsonb end
         ) with ordinality as t),
        '[]'::jsonb))
    when 'notifications' then pg_catalog.jsonb_build_object('body', null)
    else '{}'::jsonb
  end);

  -- Pseudonyms can be longer than the names they replace: keep within the columns' limits.
  v_caps := case p_table
    when 'proposals' then '{"title": 200, "summary": 2000}'::jsonb
    when 'notifications' then '{"title": 200}'::jsonb
    when 'program_items' then '{"title": 200, "description": 2000, "location": 120}'::jsonb
    when 'room_assignments' then '{"override_reason": 1000}'::jsonb
    when 'cleaning_tasks' then '{"problem_note": 500}'::jsonb
    when 'pickups' then '{"pickup_location": 500, "dropoff_location": 500}'::jsonb
    else '{}'::jsonb
  end;
  for v_cap in select c.key, c.value::integer as max_length from pg_catalog.jsonb_each_text(v_caps) as c loop
    if pg_catalog.jsonb_typeof(v_row -> v_cap.key) = 'string' then
      v_row := v_row || pg_catalog.jsonb_build_object(v_cap.key, pg_catalog.left(v_row ->> v_cap.key, v_cap.max_length));
    end if;
  end loop;
  return v_row;
end
$$;

-- What to look for, built only from recorded names: guest names (current and in the audit
-- history), delegation names, contact names (delegations and the names in registration forms) and
-- pickup addresses of 8+ characters. Returns
--   full_pattern  whole names and addresses, matched case-insensitively as whole words;
--   token_pattern first names and surnames of guests and contacts (3+ letters, not a title, not
--                 already a whole name), matched case-sensitively as written and capitalised;
--   aliases       lookup key → replacement. A guest keeps a stable pseudonym; a name part shared by
--                 several guests, contacts and addresses become a neutral marker.
create function private.purge_replacements(
  p_event_id uuid, out full_pattern text, out token_pattern text, out aliases jsonb
)
language sql
stable
set search_path = ''
as $$
  with guest_names (name, alias) as (
    select g.full_name, 'Guest ' || pg_catalog.left(g.id::text, 8)
    from public.guests g where g.event_id = p_event_id
    union
    select v.name, 'Guest ' || pg_catalog.left(a.entity_id::text, 8)
    from public.audit_log a
    cross join lateral (values (a.before ->> 'full_name'), (a.after ->> 'full_name')) as v (name)
    where a.event_id = p_event_id and a.entity_type = 'guests'
  ),
  contact_names (name) as (
    select d.contact_name from public.delegations d where d.event_id = p_event_id
    union
    select v.name
    from public.audit_log a
    cross join lateral (values (a.before ->> 'contact_name'), (a.after ->> 'contact_name')) as v (name)
    where a.event_id = p_event_id and a.entity_type = 'delegations'
    union
    select v.name
    from public.intake_submissions s
    cross join lateral (values (s.normalized ->> 'full_name'), (s.normalized ->> 'contact_name')) as v (name)
    where s.event_id = p_event_id
  ),
  delegation_names (name, alias) as (
    select d.name, 'Delegation ' || pg_catalog.left(d.id::text, 8)
    from public.delegations d where d.event_id = p_event_id
    union
    select v.name, 'Delegation ' || pg_catalog.left(a.entity_id::text, 8)
    from public.audit_log a
    cross join lateral (values (a.before ->> 'name'), (a.after ->> 'name')) as v (name)
    where a.event_id = p_event_id and a.entity_type = 'delegations'
  ),
  addresses (address) as (
    select a.pickup_address from public.arrivals a where a.event_id = p_event_id
    union
    select p.pickup_location from public.pickups p where p.event_id = p_event_id and p.kind = 'location'
    union
    select s.normalized ->> 'pickup_address' from public.intake_submissions s where s.event_id = p_event_id
  ),
  whole (term, alias, priority) as (
    select name, alias, 1 from guest_names
    union all select name, alias, 2 from delegation_names
    union all select name, '[name removed]', 3 from contact_names
    union all select address, '[address removed]', 4 from addresses where pg_catalog.char_length(pg_catalog.btrim(address)) >= 8
  ),
  whole_terms as (
    select private.purge_key(w.term) as key, (pg_catalog.array_agg(w.term order by w.priority))[1] as term,
      (pg_catalog.array_agg(w.alias order by w.priority, w.alias))[1] as alias
    from whole w
    where w.term is not null and pg_catalog.char_length(pg_catalog.btrim(w.term)) >= 3
    group by 1
  ),
  tokens (token, alias) as (
    select t.token, n.alias
    from (select name, alias from guest_names union all select name, '[name removed]' from contact_names) as n
    cross join lateral pg_catalog.regexp_split_to_table(n.name, '[^[:alpha:]''’-]+') as t (token)
    where pg_catalog.char_length(t.token) >= 3
      and pg_catalog.lower(t.token) <> all (array[
        'mrs', 'miss', 'prof', 'professor', 'sir', 'dame', 'lord', 'lady', 'rev', 'revd', 'reverend', 'bishop',
        'archbishop', 'pastor', 'father', 'imam', 'alhaji', 'alhaja', 'chief', 'hon', 'honourable', 'his', 'her',
        'excellency', 'hrh', 'mallam', 'madam', 'engr', 'barr', 'senator', 'governor', 'president', 'minister',
        'ambassador', 'general', 'colonel', 'major', 'captain', 'the', 'and', 'guest', 'delegation'
      ])
  ),
  token_terms as (
    select private.purge_key(t.token) as key,
      pg_catalog.array_agg(distinct t.token) || pg_catalog.array_agg(distinct pg_catalog.initcap(t.token)) as forms,
      -- The guest's pseudonym when exactly one guest has this name part (a contact or registration
      -- with the same name is usually that guest); otherwise a neutral marker.
      case when count(distinct t.alias) filter (where t.alias like 'Guest %') = 1
        then pg_catalog.min(t.alias) filter (where t.alias like 'Guest %') else '[name removed]' end as alias
    from tokens t
    where not exists (select 1 from whole_terms w where w.key = private.purge_key(t.token))
    group by 1
  ),
  token_forms as (
    select distinct f.form from token_terms tt cross join lateral pg_catalog.unnest(tt.forms) as f (form)
  )
  select
    (select '\y(' || pg_catalog.string_agg(private.purge_regex_literal(w.term), '|' order by pg_catalog.char_length(w.term) desc, w.term) || ')\y'
     from whole_terms w),
    (select '\y(' || pg_catalog.string_agg(private.purge_regex_literal(f.form), '|' order by pg_catalog.char_length(f.form) desc, f.form) || ')\y'
     from token_forms f),
    coalesce((select pg_catalog.jsonb_object_agg(w.key, w.alias) from whole_terms w), '{}'::jsonb)
      || coalesce((select pg_catalog.jsonb_object_agg(tt.key, tt.alias) from token_terms tt), '{}'::jsonb)
$$;

-- The single event, locked, for a Super Admin only.
create function private.lock_event_for_super_admin()
returns public.events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can export or remove event data' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into v_event from public.events limit 1 for update;
  if not found then
    raise exception 'Set up the event first' using errcode = 'P0002', hint = 'event_not_found';
  end if;
  return v_event;
end
$$;

-- Purge -----------------------------------------------------------------------------------------

create function public.purge_guest_data(p_confirmation text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events := private.lock_event_for_super_admin();
  v_full text;
  v_tokens text;
  v_aliases jsonb;
  v_mark bigint;
  v_counts jsonb := '{}'::jsonb;
  v_rows integer;
begin
  if (pg_catalog.now() at time zone v_event.timezone)::date <= v_event.ends_on then
    raise exception 'Guest personal data can be removed only after the event has ended (after %)', v_event.ends_on
      using errcode = '55000', hint = 'event_not_ended',
        detail = pg_catalog.jsonb_build_object('ends_on', v_event.ends_on)::text;
  end if;
  if pg_catalog.lower(pg_catalog.btrim(coalesce(p_confirmation, ''))) <> pg_catalog.lower(pg_catalog.btrim(v_event.name)) then
    raise exception 'Type the event name exactly to confirm' using errcode = '22023', hint = 'confirmation_mismatch';
  end if;

  select r.full_pattern, r.token_pattern, r.aliases into v_full, v_tokens, v_aliases from private.purge_replacements(v_event.id) r;
  select coalesce(max(a.id), 0) into v_mark from public.audit_log a;
  -- Row entries from the updates below are recognisable by this action and deleted afterwards.
  perform private.set_audit_context(p_actor_type => 'user', p_action => 'event.purge.row', p_undoable => false);

  update public.guests t set (full_name, share_group, title, organisation, position, phone, email, accessibility, dietary, notes) = (
    select r.full_name, r.share_group, r.title, r.organisation, r.position, r.phone, r.email, r.accessibility, r.dietary, r.notes
    from pg_catalog.jsonb_populate_record(null::public.guests,
      private.purge_scrub_row('guests', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('guests', v_rows);

  update public.delegations t set (name, contact_name, contact_email, contact_phone, notes) = (
    select r.name, r.contact_name, r.contact_email, r.contact_phone, r.notes
    from pg_catalog.jsonb_populate_record(null::public.delegations,
      private.purge_scrub_row('delegations', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('delegations', v_rows);

  update public.guest_requirements t set (detail, conflicts_with) = (
    select r.detail, r.conflicts_with
    from pg_catalog.jsonb_populate_record(null::public.guest_requirements,
      private.purge_scrub_row('guest_requirements', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('guest_requirements', v_rows);

  update public.intake_submissions t set (payload, normalized, extraction, issues, review_note, client_ip_hash) = (
    select r.payload, r.normalized, r.extraction, r.issues, r.review_note, r.client_ip_hash
    from pg_catalog.jsonb_populate_record(null::public.intake_submissions,
      private.purge_scrub_row('intake_submissions', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('intake_submissions', v_rows);

  update public.arrivals t set pickup_address = (
    select r.pickup_address
    from pg_catalog.jsonb_populate_record(null::public.arrivals,
      private.purge_scrub_row('arrivals', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id and t.pickup_address is not null;

  update public.pickups t set (pickup_location, dropoff_location, notes) = (
    select r.pickup_location, r.dropoff_location, r.notes
    from pg_catalog.jsonb_populate_record(null::public.pickups,
      private.purge_scrub_row('pickups', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;

  update public.room_assignments t set override_reason = (
    select r.override_reason
    from pg_catalog.jsonb_populate_record(null::public.room_assignments,
      private.purge_scrub_row('room_assignments', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id and t.override_reason is not null;

  update public.program_items t set (title, description, location) = (
    select r.title, r.description, r.location
    from pg_catalog.jsonb_populate_record(null::public.program_items,
      private.purge_scrub_row('program_items', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;

  update public.cleaning_tasks t set problem_note = (
    select r.problem_note
    from pg_catalog.jsonb_populate_record(null::public.cleaning_tasks,
      private.purge_scrub_row('cleaning_tasks', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id and t.problem_note is not null;

  update public.proposals t set (title, summary, rationale, payload, decision_note, execution_error) = (
    select r.title, r.summary, r.rationale, r.payload, r.decision_note, r.execution_error
    from pg_catalog.jsonb_populate_record(null::public.proposals,
      private.purge_scrub_row('proposals', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('proposals', v_rows);

  update public.notifications t set (title, body) = (
    select r.title, r.body
    from pg_catalog.jsonb_populate_record(null::public.notifications,
      private.purge_scrub_row('notifications', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where coalesce(t.event_id, v_event.id) = v_event.id;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('notifications', v_rows);

  update public.copilot_exchanges t set (question, answer, transcript_original, tools, citations) = (
    select r.question, r.answer, r.transcript_original, r.tools, r.citations
    from pg_catalog.jsonb_populate_record(null::public.copilot_exchanges,
      private.purge_scrub_row('copilot_exchanges', pg_catalog.to_jsonb(t), v_full, v_tokens, v_aliases)) r)
  where t.event_id = v_event.id;
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('copilot_exchanges', v_rows);

  perform private.clear_audit_context();

  -- The purge's own row entries carry the old values in "before": remove them (this transaction's
  -- rows only), then anonymise the earlier history of guest data the same way as the live rows.
  delete from public.audit_log a where a.id > v_mark and a.action = 'event.purge.row';

  update public.audit_log a
  set before = private.purge_scrub_row(a.entity_type, a.before, v_full, v_tokens, v_aliases),
      after = private.purge_scrub_row(a.entity_type, a.after, v_full, v_tokens, v_aliases),
      reason = private.purge_redact_text(a.reason, v_full, v_tokens, v_aliases)
  where coalesce(a.event_id, v_event.id) = v_event.id
    and a.entity_type not in ('profiles', 'events', 'room_types', 'rooms', 'drivers', 'driver_shifts', 'vip_categories');
  get diagnostics v_rows = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('audit_entries', v_rows);

  insert into public.audit_log (event_id, actor_type, actor_id, action, entity_type, entity_id, before, after, reason)
  values (
    v_event.id, 'user', private.current_user_id(), 'event.purge', 'events', v_event.id, null, v_counts,
    'Guest personal data removed after the event'
  );

  return v_counts;
end
$$;
grant execute on function public.purge_guest_data(text) to vip_app;

-- Export ----------------------------------------------------------------------------------------

-- One table's rows for the event as a JSON array, without the listed columns.
create function private.export_rows(p_table text, p_event_id uuid, p_exclude text[] default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  execute pg_catalog.format(
    'select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - $1 order by t.created_at, t.id), ''[]''::jsonb) '
    'from public.%I t where t.event_id = $2',
    p_table
  ) into v_rows using p_exclude, p_event_id;
  return v_rows;
end
$$;

-- The event's operational data for a download. Never accounts, sessions, auth tables, the intake
-- token, submissions' raw payloads, Co-Pilot logs or notifications.
create function public.export_event_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events := private.lock_event_for_super_admin();
  v_data jsonb;
  v_counts jsonb;
begin
  v_data := pg_catalog.jsonb_build_object(
    'exported_at', pg_catalog.now(),
    'event', pg_catalog.to_jsonb(v_event) - 'intake_token',
    'vip_categories', private.export_rows('vip_categories', v_event.id),
    'room_types', private.export_rows('room_types', v_event.id),
    'rooms', private.export_rows('rooms', v_event.id),
    'drivers', private.export_rows('drivers', v_event.id, array['phone']),
    'delegations', private.export_rows('delegations', v_event.id),
    'guests', private.export_rows('guests', v_event.id),
    'guest_requirements', private.export_rows('guest_requirements', v_event.id),
    'flights', private.export_rows('flights', v_event.id, array['last_payload']),
    'arrivals', private.export_rows('arrivals', v_event.id),
    'pickups', private.export_rows('pickups', v_event.id),
    'pickup_assignments', private.export_rows('pickup_assignments', v_event.id),
    'room_assignments', private.export_rows('room_assignments', v_event.id),
    'program_items', private.export_rows('program_items', v_event.id),
    'program_participants', coalesce(
      (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pp) order by pp.created_at, pp.id)
       from public.program_participants pp
       join public.program_items i on i.id = pp.program_item_id
       where i.event_id = v_event.id),
      '[]'::jsonb),
    'cleaning_tasks', private.export_rows('cleaning_tasks', v_event.id)
  );

  select pg_catalog.jsonb_object_agg(e.key, pg_catalog.jsonb_array_length(e.value)) into v_counts
  from pg_catalog.jsonb_each(v_data) e
  where pg_catalog.jsonb_typeof(e.value) = 'array';

  insert into public.audit_log (event_id, actor_type, actor_id, action, entity_type, entity_id, before, after, reason)
  values (v_event.id, 'user', private.current_user_id(), 'event.export', 'events', v_event.id, null, v_counts, 'Event data exported');

  return v_data;
end
$$;
grant execute on function public.export_event_data() to vip_app;

-- migrate:down
drop function if exists public.export_event_data();
drop function if exists private.export_rows(text, uuid, text[]);
drop function if exists public.purge_guest_data(text);
drop function if exists private.lock_event_for_super_admin();
drop function if exists private.purge_replacements(uuid);
drop function if exists private.purge_scrub_row(text, jsonb, text, text, jsonb);
drop function if exists private.purge_overlay(jsonb, jsonb);
drop function if exists private.purge_redact_jsonb(jsonb, text, text, jsonb, boolean);
drop function if exists private.purge_redact_text(text, text, text, jsonb);
drop function if exists private.purge_replace_matches(text, text, jsonb, text);
drop function if exists private.purge_key(text);
drop function if exists private.purge_regex_literal(text);
drop function if exists private.purge_is_free_text(text);
