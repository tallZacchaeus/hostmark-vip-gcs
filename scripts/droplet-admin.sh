#!/usr/bin/env bash
# Create a Super Admin on the droplet's database (docs/02-TRD.md section 5.1), from a laptop:
#   bash scripts/droplet-admin.sh --email you@example.com --name "Your Name"
# Opens an SSH tunnel to the droplet's Postgres (loopback only there), runs
# scripts/create-super-admin.ts against it and closes the tunnel. The temporary password is
# printed once, in your terminal only; it must be changed at first sign-in.
# Needs .env.droplet.local (the droplet's secrets, gitignored) and SSH access as root.
set -euo pipefail

readonly HOST=${DROPLET_HOST:-root@178.62.105.236}
readonly KEY=${DROPLET_SSH_KEY:-$HOME/.ssh/hostmark_droplet}
readonly LOCAL_PORT=${DROPLET_TUNNEL_PORT:-15432}
readonly SECRETS=.env.droplet.local

cd "$(dirname "$0")/.."
[[ -f $SECRETS ]] || { echo "Missing $SECRETS (the droplet's secrets)." >&2; exit 1; }

secret() { grep "^$1=" "$SECRETS" | cut -d= -f2-; }

env_file=$(mktemp)
tunnel_pid=''
cleanup() {
  rm -f "$env_file"
  [[ -n $tunnel_pid ]] && kill "$tunnel_pid" 2>/dev/null || true
}
trap cleanup EXIT

target="127.0.0.1:$LOCAL_PORT/vip_gcs?sslmode=disable"
{
  echo "DATABASE_URL=postgres://vip_app:$(secret APP_DB_PASSWORD)@$target"
  echo "SERVICE_DATABASE_URL=postgres://vip_service:$(secret SERVICE_DB_PASSWORD)@$target"
  echo "BETTER_AUTH_SECRET=$(secret BETTER_AUTH_SECRET)"
  echo "BETTER_AUTH_URL=https://$(secret SITE_ADDRESS)"
} > "$env_file"

ssh -i "$KEY" -o BatchMode=yes -o ExitOnForwardFailure=yes -N -L "$LOCAL_PORT:127.0.0.1:5432" "$HOST" &
tunnel_pid=$!
sleep 2

node --conditions=react-server --env-file="$env_file" --import tsx scripts/create-super-admin.ts "$@"
