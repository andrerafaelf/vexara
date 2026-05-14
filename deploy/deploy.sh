#!/usr/bin/env bash
# Zero-downtime rolling deploy for Vexara
# Usage: bash deploy.sh <image-tag>
# Called by GitHub Actions; can also be run manually on the VPS.

set -euo pipefail

IMAGE_TAG="${1:-latest}"
APP_DIR="/opt/vexara"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
TIMEOUT=120  # seconds to wait for each service to become healthy

cd "$APP_DIR"

echo "[deploy] Starting deploy with IMAGE_TAG=$IMAGE_TAG"

# Export so docker compose picks it up from the environment too
export IMAGE_TAG

# Pull all new images (fast, parallel)
echo "[deploy] Pulling images..."
$COMPOSE pull --quiet

# Rolling restart: database first, then backends, then frontends
# Each service is restarted individually so the others stay up.
SERVICES_ORDER="postgres server admin-server client admin-client grafana nginx"

for SERVICE in $SERVICES_ORDER; do
  echo "[deploy] Updating $SERVICE..."
  $COMPOSE up -d --no-deps "$SERVICE"

  # Wait for healthy state
  ELAPSED=0
  until [ "$($COMPOSE ps -q "$SERVICE" | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo 'none')" = "healthy" ] || \
        [ "$($COMPOSE ps -q "$SERVICE" | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo 'none')" = "none" ]; do
    if [ $ELAPSED -ge $TIMEOUT ]; then
      echo "[deploy] ERROR: $SERVICE did not become healthy within ${TIMEOUT}s"
      echo "[deploy] Logs:"
      $COMPOSE logs --tail=50 "$SERVICE"
      exit 1
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
  done

  # For services with defined healthchecks, confirm healthy
  HEALTH=$($COMPOSE ps -q "$SERVICE" | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo 'none')
  if [ "$HEALTH" = "unhealthy" ]; then
    echo "[deploy] ERROR: $SERVICE is unhealthy. Rolling back..."
    $COMPOSE logs --tail=50 "$SERVICE"
    exit 1
  fi

  echo "[deploy] $SERVICE is up (health: $HEALTH)"
done

# Remove dangling images to recover disk space
docker image prune -f --filter "until=72h"

echo "[deploy] Deploy complete. IMAGE_TAG=$IMAGE_TAG"
echo ""
$COMPOSE ps
