-- Supabase, once per project, as postgres, after the first Vercel deploy: runs the background
-- worker by calling GET /api/internal/worker-tick (docs/02-TRD.md §5.2). Vercel's own cron runs
-- at most daily on the Hobby plan; pg_cron can run every few seconds.
-- The URL and CRON_SECRET (from .env.deploy.local) are kept in Supabase Vault, not in job text.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<production domain>/api/internal/worker-tick', 'worker_tick_url', 'VIP GCS worker endpoint');

-- The bearer secret is stored from the deploy machine, so it is never pasted anywhere:
--   1. here:  grant usage on schema vault to vip_owner;
--             grant execute on function vault.create_secret(text, text, text, uuid) to vip_owner;
--   2. there: (set -a; . ./.env.deploy.local; set +a; printf '%s\n' '\getenv secret CRON_SECRET' \
--               "select vault.create_secret(:'secret', 'worker_tick_secret') is not null;" \
--               | psql "$DBMATE_URL" -X -At -f -)
--   3. here:  revoke execute on function vault.create_secret(text, text, text, uuid) from vip_owner;
--             revoke usage on schema vault from vip_owner;

-- Kept out of the app's schemas (the migrations own those) and out of the Data API's (public).
create schema if not exists ops;
revoke all on schema ops from public;

create or replace function ops.call_worker_tick(p_poll boolean) returns bigint
language sql set search_path = '' as $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_tick_url')
      || case when p_poll then '?poll=1' else '' end,
    headers := pg_catalog.jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'worker_tick_secret')),
    timeout_milliseconds := 55000
  )
$$;
revoke all on function ops.call_worker_tick(boolean) from public;

-- Flight checks, driver and room suggestions (and any due simulation steps): every minute.
select cron.schedule('vip-worker-poll', '* * * * *', 'select ops.call_worker_tick(true)');

-- Simulation steps every 5 seconds, but only while a simulation runs: no calls otherwise.
select cron.schedule('vip-worker-simulation', '5 seconds', $$
  select ops.call_worker_tick(false)
  where exists (select 1 from public.simulation_runs where status = 'running')
$$);

-- pg_cron keeps a row per run; keep two days.
select cron.schedule('vip-cron-history-cleanup', '17 3 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '2 days'
$$);
