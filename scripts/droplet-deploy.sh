#!/usr/bin/env bash
# Deploy the current checkout to the 1 GB droplet (docs/02-TRD.md section 5.1).
# Builds the x86 app image on this machine (the droplet has too little memory for `next build`),
# loads it on the droplet, copies the Compose files and migrations, then restarts the stack;
# the migrate job applies any new migrations before the app starts.
#   bash scripts/droplet-deploy.sh
# Needs: Docker with buildx, SSH access as root. Secrets stay in /opt/hostmark/.env.production.
set -euo pipefail

readonly HOST=${DROPLET_HOST:-root@178.62.105.236}
readonly KEY=${DROPLET_SSH_KEY:-$HOME/.ssh/hostmark_droplet}
readonly DIR=/opt/hostmark
readonly IMAGE=vip-gcs-app:latest
readonly COMPOSE="docker compose -f compose.yaml -f compose.droplet.yaml --env-file .env.production"

remote() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

cd "$(dirname "$0")/.."

echo '1/4  Building the app image (linux/amd64)'
docker buildx build --platform linux/amd64 --target runner -t "$IMAGE" --load .

echo '2/4  Loading the image on the droplet'
docker save "$IMAGE" | gzip -1 | remote 'gunzip | docker load'

echo '3/4  Copying Compose files, Caddyfile and migrations'
COPYFILE_DISABLE=1 tar czf - compose.yaml compose.droplet.yaml Caddyfile db/docker-init db/migrations \
  | remote "cd $DIR && tar xzf - --no-same-owner && chmod 755 db/docker-init/*.sh"

echo '4/4  Restarting the stack'
remote "cd $DIR && $COMPOSE up -d --remove-orphans && docker image prune -f >/dev/null && $COMPOSE ps"
