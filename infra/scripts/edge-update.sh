#!/usr/bin/env bash
# Update a mosque edge server to a new image tag published by the cloud.
#   ./infra/scripts/edge-update.sh 1.2.0          # explicit tag
#   ./infra/scripts/edge-update.sh                # tag reported by the cloud (/api/sync/version)
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=${ENV_FILE:-.env}
[ -f "$ENV_FILE" ] || { echo ".env not found"; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

TAG="${1:-}"
if [ -z "$TAG" ]; then
  if [ -z "${CLOUD_API_URL:-}" ]; then echo "no tag given and CLOUD_API_URL is empty"; exit 1; fi
  TAG=$(curl -fsS -H "x-sync-key: ${EDGE_SYNC_KEY:-}" "$CLOUD_API_URL/api/sync/version" | sed -n 's/.*"latestImageTag":"\([^"]*\)".*/\1/p')
  [ -n "$TAG" ] || { echo "could not read latest tag from cloud"; exit 1; }
fi

echo "updating edge to image tag: $TAG (current: ${IMAGE_TAG:-unknown})"
if grep -q '^IMAGE_TAG=' "$ENV_FILE"; then
  sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" "$ENV_FILE"
else
  echo "IMAGE_TAG=$TAG" >> "$ENV_FILE"
fi

docker compose -f docker-compose.edge.yml pull
docker compose -f docker-compose.edge.yml up -d --remove-orphans
docker image prune -f >/dev/null
echo "done. running:"
docker compose -f docker-compose.edge.yml ps
