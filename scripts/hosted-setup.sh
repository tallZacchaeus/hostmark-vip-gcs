#!/usr/bin/env bash
# First deploy to Vercel + Supabase (docs/02-TRD.md §5.2), driven by .env.deploy.local: database
# migrations, optional demo data, the Vercel project and its production environment variables,
# then a production deploy. Secrets are piped from the file and never printed (the seed prints the
# demo accounts' shared password, which testers need). Safe to re-run.
#   bash scripts/hosted-setup.sh [--seed]
# Later deploys: pnpm hosted:migrate && vercel deploy --prod
set -euo pipefail
cd "$(dirname "$0")/.."

readonly ENV_FILE=.env.deploy.local
readonly SCOPE=${VERCEL_SCOPE:-zacchaeus-projects-719b8ec1}
readonly PROJECT=${VERCEL_PROJECT:-hostmark-vip}
# Runtime settings only: the owner (migration) credential never leaves this machine.
readonly SECRET_KEYS=(DATABASE_URL DATABASE_LISTEN_URL SERVICE_DATABASE_URL BETTER_AUTH_SECRET CRON_SECRET)
readonly PLAIN_KEYS=(BETTER_AUTH_URL WORKER_MODE)
export VERCEL_TELEMETRY_DISABLED=1

if [[ ! -f $ENV_FILE ]]; then
  echo "Missing $ENV_FILE (see docs/02-TRD.md §5.2)." >&2
  exit 1
fi

value_of() {
  local value
  value=$(grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2-) || true
  if [[ -z $value ]]; then
    echo "$1 is not set in $ENV_FILE." >&2
    exit 1
  fi
  printf '%s' "$value"
}

# Checked up front: an exit inside "$(value_of …)" below would only leave the subshell.
for key in "${SECRET_KEYS[@]}" "${PLAIN_KEYS[@]}" DBMATE_URL DATABASE_MIGRATION_URL; do
  value_of "$key" > /dev/null
done

# name, value, then any extra `vercel env add` flags
set_production_env() {
  printf '%s' "$2" | vercel env add "$1" production --force "${@:3}" --scope "$SCOPE" > /dev/null
}

echo '1/5  Applying database migrations'
pnpm --silent hosted:migrate

if [[ ${1:-} == --seed ]]; then
  echo '2/5  Loading demo data (accounts and their password follow)'
  pnpm --silent hosted:seed
else
  echo '2/5  Skipping demo data (pass --seed to load it into an empty database)'
fi

echo "3/5  Linking the Vercel project $PROJECT"
vercel project add "$PROJECT" --scope "$SCOPE" > /dev/null 2>&1 || true # already exists
vercel link --yes --project "$PROJECT" --scope "$SCOPE" > /dev/null

echo '4/5  Setting production environment variables'
for key in "${SECRET_KEYS[@]}"; do
  set_production_env "$key" "$(value_of "$key")" --sensitive
done
for key in "${PLAIN_KEYS[@]}"; do
  set_production_env "$key" "$(value_of "$key")" --no-sensitive
done
# pnpm 11 from package.json's packageManager field.
set_production_env ENABLE_EXPERIMENTAL_COREPACK 1 --no-sensitive

echo '5/5  Deploying to production'
vercel deploy --prod --yes --scope "$SCOPE"
echo "Done. BETTER_AUTH_URL is $(value_of BETTER_AUTH_URL): if Vercel printed a different production URL, update it in $ENV_FILE and re-run."
