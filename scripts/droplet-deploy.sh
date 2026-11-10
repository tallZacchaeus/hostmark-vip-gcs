#!/usr/bin/env bash
# Deploy the current checkout to the 1 GB droplet (docs/02-TRD.md section 5.1).
# Builds the x86 app image on this machine (the droplet has too little memory for `next build`),
# loads it on the droplet, copies the Compose files and migrations, then restarts the stack;
# the migrate job applies any new migrations before the app starts.
#   bash scripts/droplet-deploy.sh                    full deploy
#   bash scripts/droplet-deploy.sh --settings-only    only copy .env.droplet.local and restart (e.g. a new key)
# Needs: Docker with buildx, SSH access as root, and .env.droplet.local (the droplet's settings and
# secrets, gitignored): it is copied to /opt/hostmark/.env.production on every deploy, without
# comments or SEED_PASSWORD, so editing that file and deploying is how settings change.
set -euo pipefail

readonly HOST=${DROPLET_HOST:-root@178.62.105.236}
readonly KEY=${DROPLET_SSH_KEY:-$HOME/.ssh/hostmark_droplet}
readonly DIR=/opt/hostmark
readonly IMAGE=vip-gcs-app:latest
readonly SETTINGS=.env.droplet.local
readonly COMPOSE="docker compose -f compose.yaml -f compose.droplet.yaml --env-file .env.production"

remote() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

cd "$(dirname "$0")/.."
[[ -f $SETTINGS ]] || { echo "Missing $SETTINGS (the droplet's settings and secrets)." >&2; exit 1; }

if [[ ${1:-} != --settings-only ]]; then
  echo '1/5  Building the app image (linux/amd64)'
  docker buildx build --platform linux/amd64 --target runner -t "$IMAGE" --load .

  echo '2/5  Loading the image on the droplet'
  docker save "$IMAGE" | gzip -1 | remote 'gunzip | docker load'

  echo '3/5  Copying Compose files, Caddyfile and migrations'
  COPYFILE_DISABLE=1 tar czf - compose.yaml compose.droplet.yaml Caddyfile db/docker-init db/migrations \
    | remote "cd $DIR && tar xzf - --no-same-owner && chmod 755 db/docker-init/*.sh"
fi

echo '4/5  Updating the settings (.env.production)'
grep -vE '^(#|SEED_PASSWORD=|$)' "$SETTINGS" | remote "umask 077 && cat > $DIR/.env.production"

echo '5/5  Restarting the stack'
remote "cd $DIR && $COMPOSE up -d --remove-orphans && docker image prune -f >/dev/null && $COMPOSE ps"
