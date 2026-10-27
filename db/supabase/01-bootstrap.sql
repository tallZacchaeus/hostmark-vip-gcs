-- Supabase, once per project, as postgres (SQL editor), before `pnpm hosted:migrate`.
-- The Supabase counterpart of db/docker-init/01-app-role.sh; see docs/02-TRD.md §5.2.
--
-- Passwords are given as SCRAM-SHA-256 verifiers computed on your machine from the passwords in
-- .env.deploy.local, so no plaintext password is pasted into the dashboard. Any SCRAM tool works,
-- e.g. Python: hashlib.pbkdf2_hmac('sha256', password, salt, 4096) → StoredKey/ServerKey.

-- Owns every object the migrations create (as on Docker). Supabase's automatic grants to its
-- public API roles (anon, authenticated) only cover objects created by postgres, so tables owned
-- by vip_owner are not reachable through the Supabase Data API.
create role vip_owner login createrole password '<SCRAM verifier of OWNER_DB_PASSWORD>';
grant create on database postgres to vip_owner;
grant usage, create on schema public to vip_owner with grant option;

-- Runtime logins; the foundation migration finds them and grants their privileges.
create role vip_app login noinherit password '<SCRAM verifier of APP_DB_PASSWORD>';
create role vip_service login noinherit password '<SCRAM verifier of SERVICE_DB_PASSWORD>';

-- Extensions the migrations use, in public as on Docker ("create extension if not exists").
create extension if not exists btree_gist with schema public;
create extension if not exists pg_trgm with schema public;

-- Supabase Studio and pg_cron run as postgres: membership lets them read the app's tables.
grant vip_owner to postgres;
