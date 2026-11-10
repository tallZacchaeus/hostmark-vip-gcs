-- migrate:up
-- Room scenarios in simulation runs (FR-PL-10): like flight_ids, the rooms and delegations a run's
-- steps act on are fixed when it starts (step.room / step.delegation index them;
-- lib/domain/simulation/scenarios.ts). The table's grants and RLS already cover the new columns:
-- coordinators insert them with the run (table-level insert) but cannot change them afterwards
-- (vip_app may update only status and stopped_at); the worker (vip_system) has full access.

alter table public.simulation_runs
  add column room_ids uuid[] not null default '{}' check (pg_catalog.cardinality(room_ids) <= 10),
  add column delegation_ids uuid[] not null default '{}' check (pg_catalog.cardinality(delegation_ids) <= 10);

-- migrate:down
alter table public.simulation_runs
  drop column if exists delegation_ids,
  drop column if exists room_ids;
