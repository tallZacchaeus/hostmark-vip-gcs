#!/bin/sh
# Runs once, when the Postgres data volume is first initialised.
# Creates the two login roles; migrations grant their privileges:
#   vip_app      the API (row-level security applies)      password: APP_DB_PASSWORD
#   vip_service  trusted server processes (Better Auth, scripts, worker) password: SERVICE_DB_PASSWORD
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" \
  -v service_password="$SERVICE_DB_PASSWORD" <<'EOSQL'
create role vip_app login noinherit password :'app_password';
create role vip_service login noinherit password :'service_password';
EOSQL
