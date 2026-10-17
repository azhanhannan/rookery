#!/usr/bin/env bash
# Deploys one image tag on the droplet: pull, back up the database, start, wait for healthy.
#   ./deploy.sh <tag>      CI runs this with the commit SHA, after `docker login ghcr.io`.
#   ./deploy.sh <old-sha>  is also the rollback (see docs/DEPLOY.md: migrations only go forward).
set -euo pipefail
cd "$(dirname "$0")"

tag="${1:?usage: deploy.sh <image-tag>}"
[[ -f .env ]] || { echo "deploy: .env missing (copy .env.example and fill it in)" >&2; exit 1; }
[[ -s certs/origin.pem && -s certs/origin-key.pem ]] || { echo "deploy: certs/origin.pem or origin-key.pem missing" >&2; exit 1; }

# Record the tag in .env, so a plain `docker compose up -d` later starts the same images.
if grep -q '^IMAGE_TAG=' .env; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${tag}/" .env
else
  echo "IMAGE_TAG=${tag}" >> .env
fi

echo "deploy: pulling ${tag}"
docker compose pull api web db

# The api applies pending migrations on start: dump first while the old version still runs.
if docker compose ps --status running --services | grep -qx db; then
  ./backup.sh pre-deploy
fi

echo "deploy: starting"
if ! docker compose up -d --remove-orphans --wait --wait-timeout 180; then
  echo "deploy: not healthy. Last api logs:" >&2
  docker compose logs --tail 80 api >&2 || true
  exit 1
fi

echo "$(date -u +%FT%TZ) ${tag}" >> deploy-history.log
# Old images for rollback stay a week; after that a rollback pulls them again from GHCR.
docker image prune -af --filter "until=168h" > /dev/null
docker compose ps
echo "deploy: ${tag} is live"
