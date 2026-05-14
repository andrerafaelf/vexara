#!/usr/bin/env bash
# Zero-downtime rolling deploy for Vexara
# Usage: bash deploy.sh <image-tag>
# Called by GitHub Actions; can also be run manually on the VPS.

set -euo pipefail

IMAGE_TAG="${1:-latest}"
APP_DIR="/opt/vexara"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
TIMEOUT=120       # seconds to wait for each service to become healthy
GRAFANA_TIMEOUT=300  # grafana downloads plugins on first start

cd "$APP_DIR"

# Load .env so DOMAIN and other vars are available in this script
set -o allexport
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +o allexport

echo "[deploy] Starting deploy with IMAGE_TAG=$IMAGE_TAG"

# Substitute domain placeholder in nginx.conf before the container mounts it
sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" \
  "$APP_DIR/deploy/nginx/nginx.conf.template" \
  > "$APP_DIR/deploy/nginx/nginx.conf"

# Pull all new images (fast, parallel)
echo "[deploy] Pulling images..."
$COMPOSE pull --quiet

# Rolling restart: database first, then backends, then frontends
# Each service is restarted individually so the others stay up.
SERVICES_ORDER="postgres server admin-server client admin-client grafana nginx"

for SERVICE in $SERVICES_ORDER; do
  echo "[deploy] Updating $SERVICE..."
  $COMPOSE up -d --no-deps "$SERVICE"

  SERVICE_TIMEOUT=$TIMEOUT
  [ "$SERVICE" = "grafana" ] && SERVICE_TIMEOUT=$GRAFANA_TIMEOUT

  ELAPSED=0
  while true; do
    HEALTH=$($COMPOSE ps -q "$SERVICE" | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo '')
    case "$HEALTH" in
      healthy) break ;;
      unhealthy)
        echo "[deploy] ERROR: $SERVICE is unhealthy."
        $COMPOSE logs --tail=50 "$SERVICE"
        exit 1
        ;;
      # empty string = no healthcheck defined, container is running
      '')
        RUNNING=$($COMPOSE ps -q "$SERVICE" | xargs docker inspect --format='{{.State.Running}}' 2>/dev/null || echo 'false')
        [ "$RUNNING" = "true" ] && break
        ;;
    esac
    if [ $ELAPSED -ge $SERVICE_TIMEOUT ]; then
      echo "[deploy] ERROR: $SERVICE did not become healthy within ${SERVICE_TIMEOUT}s"
      $COMPOSE logs --tail=50 "$SERVICE"
      exit 1
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
  done

  echo "[deploy] $SERVICE is up (health: ${HEALTH:-none})"
done

# Remove dangling images to recover disk space
docker image prune -f --filter "until=72h"

echo "[deploy] Deploy complete. IMAGE_TAG=$IMAGE_TAG"
echo ""
$COMPOSE ps
