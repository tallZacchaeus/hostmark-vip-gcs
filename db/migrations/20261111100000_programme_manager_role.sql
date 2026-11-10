-- migrate:up
-- P9 step 9.1 (01-PRD.md section 5.7): the Programme Manager role, who owns events and runs one
-- of them live at a time. Ranked super_admin ⊇ programme_manager ⊇ admin ⊇ coordinator. Its own
-- migration because a new enum value cannot be used in the transaction that adds it.
alter type public.app_role add value if not exists 'programme_manager' before 'admin';

-- migrate:down
-- Postgres cannot drop an enum value. Rolling back 20261111100100 is enough: nothing uses the
-- value afterwards, and accounts holding it must be moved to another role first.
select 1;
