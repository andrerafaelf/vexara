#!/usr/bin/env bash
# Zero-downtime rolling deploy for Vexara
# Called by GitHub Actions; can also be run manually on the VPS.

set -euo pipefail

APP_DIR="/opt/vexara"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
TIMEOUT=120       # seconds to wait for each service to become healthy
GRAFANA_TIMEOUT=300  # grafana downloads plugins on first start

cd "$APP_DIR"

# Load .env so DOMAIN and other vars are available in this script.
# We can't `source` it: secret values may contain shell metacharacters
# (spaces, $, backticks, etc.) which bash would parse and execute.
# Compose itself reads .env literally (not via the shell) so it stays fine;
# this loop replicates that literal KEY=VALUE behavior for this script.
while IFS='=' read -r key value; do
  case "$key" in
    ''|\#*) continue ;;
  esac
  export "$key=$value"
done < "$APP_DIR/.env"

echo "[deploy] Starting deploy (server=${SERVER_TAG:-latest} admin-server=${ADMIN_SERVER_TAG:-latest} client=${CLIENT_TAG:-latest} admin-client=${ADMIN_CLIENT_TAG:-latest})"

# Verify SSL certs exist before generating nginx.conf — a missing cert
# would crash the entire proxy, taking the player-facing site down.
MAIN_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
ADMIN_CERT="/etc/letsencrypt/live/admin.${DOMAIN}/fullchain.pem"

if [ ! -f "$MAIN_CERT" ]; then
  echo "[deploy] FATAL: main cert missing at $MAIN_CERT — run bootstrap-vps.sh first" >&2
  exit 1
fi

# Render the main config from template
TEMPLATE="$APP_DIR/deploy/nginx/nginx.conf.template"
RENDERED="$APP_DIR/deploy/nginx/nginx.conf"

if [ ! -f "$TEMPLATE" ]; then
  echo "[deploy] FATAL: template not found at $TEMPLATE" >&2
  exit 1
fi

sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "$TEMPLATE" > "$RENDERED"

if [ ! -s "$RENDERED" ]; then
  echo "[deploy] FATAL: rendered nginx.conf is empty at $RENDERED" >&2
  exit 1
fi

# Sanity check: ensure substitution actually happened
if grep -q DOMAIN_PLACEHOLDER "$RENDERED"; then
  echo "[deploy] FATAL: DOMAIN_PLACEHOLDER still present in rendered config" >&2
  exit 1
fi

echo "[deploy] Rendered nginx.conf ($(wc -l < "$RENDERED") lines)"

# ─── pgAdmin auto-registered server ──────────────────────────────────────────
# Renders servers.json with postgres host/db/user, plus a libpq-format pgpass
# file so pgAdmin connects with zero clicks. pgpass MUST be mode 0600.
mkdir -p "$APP_DIR/deploy/pgadmin"
sed -e "s/POSTGRES_DB_PLACEHOLDER/${POSTGRES_DB}/g" \
    -e "s/POSTGRES_USER_PLACEHOLDER/${POSTGRES_USER}/g" \
    "$APP_DIR/deploy/pgadmin/servers.json.template" \
    > "$APP_DIR/deploy/pgadmin/servers.json"

# pgpass format: hostname:port:database:username:password
# Use * for database so the password matches any DB on this host.
printf 'postgres:5432:*:%s:%s\n' "$POSTGRES_USER" "$POSTGRES_PASSWORD" \
    > "$APP_DIR/deploy/pgadmin/pgpass"
chmod 0600 "$APP_DIR/deploy/pgadmin/pgpass"

# pgAdmin runs as UID 5050 inside the container — make sure it can read the files
chown 5050:5050 "$APP_DIR/deploy/pgadmin/pgpass" "$APP_DIR/deploy/pgadmin/servers.json" 2>/dev/null || true

# Render the admin server block from its own template, but only if the cert exists.
# Otherwise leave admin.conf empty so the main include is a no-op.
if [ -f "$ADMIN_CERT" ]; then
  # Build the admin-origin IP allowlist from ADMIN_ALLOW_IPS (comma-separated).
  # If unset, deny all so the admin origin stays inaccessible until configured.
  ADMIN_ALLOW_BLOCK=""
  if [ -n "${ADMIN_ALLOW_IPS:-}" ]; then
    IFS=',' read -ra IPS <<< "$ADMIN_ALLOW_IPS"
    for IP in "${IPS[@]}"; do
      IP="${IP// /}"  # strip spaces
      [ -n "$IP" ] && ADMIN_ALLOW_BLOCK+="    allow ${IP};"$'\n'
    done
    ADMIN_ALLOW_BLOCK+="    deny all;"
  else
    echo "[deploy] WARN: ADMIN_ALLOW_IPS unset; admin origin will reject all requests"
    ADMIN_ALLOW_BLOCK="    deny all;"
  fi

  # First do DOMAIN substitution, then inject the allowlist block.
  # Use awk for the multi-line replacement (sed escaping is fragile here).
  sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" \
    "$APP_DIR/deploy/nginx/admin.conf.template" \
    | awk -v block="$ADMIN_ALLOW_BLOCK" '
        /^ADMIN_ALLOW_PLACEHOLDER$/ { print block; next }
        { print }
      ' \
    > "$APP_DIR/deploy/nginx/admin.conf"
else
  echo "[deploy] WARN: admin cert missing at $ADMIN_CERT — admin panel will be unreachable"
  echo "[deploy] To issue it, on the VPS run:"
  echo "  sudo docker stop vx-nginx && sudo certbot certonly --standalone -d admin.${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN} && sudo docker start vx-nginx"
  : > "$APP_DIR/deploy/nginx/admin.conf"
fi

# Pull all new images (fast, parallel)
echo "[deploy] Pulling images..."
$COMPOSE pull --quiet

# Rolling restart: database first, then backends, then frontends, nginx last.
# nginx is handled specially: if the container is already running we reload its
# config in-place (nginx -s reload) so port 443 is never closed — zero downtime.
# A full recreate only happens when the container does not yet exist.
SERVICES_ORDER="postgres server admin-server client admin-client loki promtail grafana pgadmin nginx"

wait_healthy() {
  local SERVICE="$1"
  local SERVICE_TIMEOUT="$2"
  local ELAPSED=0
  local HEALTH RUNNING
  while true; do
    HEALTH=$($COMPOSE ps -q "$SERVICE" | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo '')
    case "$HEALTH" in
      healthy) break ;;
      unhealthy)
        echo "[deploy] ERROR: $SERVICE is unhealthy."
        $COMPOSE logs --tail=50 "$SERVICE"
        exit 1
        ;;
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
}

for SERVICE in $SERVICES_ORDER; do
  echo "[deploy] Updating $SERVICE..."

  SERVICE_TIMEOUT=$TIMEOUT
  [ "$SERVICE" = "grafana" ] && SERVICE_TIMEOUT=$GRAFANA_TIMEOUT

  if [ "$SERVICE" = "nginx" ]; then
    NGINX_ID=$($COMPOSE ps -q nginx 2>/dev/null || true)
    if [ -n "$NGINX_ID" ] && [ "$(docker inspect --format='{{.State.Running}}' "$NGINX_ID" 2>/dev/null)" = "true" ]; then
      # Container is running: test the new config then reload in-place.
      # nginx -t runs inside the container against the already-mounted config
      # files (written above). If the test fails we abort before touching traffic.
      echo "[deploy] nginx already running — testing config before reload..."
      if docker exec "$NGINX_ID" nginx -t 2>&1; then
        docker exec "$NGINX_ID" nginx -s reload
        echo "[deploy] nginx config reloaded (no downtime)"
      else
        echo "[deploy] ERROR: nginx config test failed — aborting to avoid outage" >&2
        exit 1
      fi
    else
      # First deploy or container was stopped — do a normal start.
      $COMPOSE up -d --no-deps --force-recreate nginx
      wait_healthy nginx $SERVICE_TIMEOUT
    fi
  else
    $COMPOSE up -d --no-deps "$SERVICE"
    wait_healthy "$SERVICE" $SERVICE_TIMEOUT
  fi
done

# Remove dangling images to recover disk space
docker image prune -f --filter "until=72h"

echo "[deploy] Deploy complete."
echo ""
$COMPOSE ps

# ─── Smoke test ───────────────────────────────────────────────────────────────
# Probe the Express healthcheck directly through the internal Docker network,
# bypassing nginx and SSL entirely. This avoids curl exit-35 (SSL handshake
# failures) when Cloudflare is pending or certs are being renewed, while still
# confirming the server container is alive and responding.
echo "[deploy] Running smoke test..."
for i in $(seq 1 12); do
  STATUS=$(docker exec vx-server \
    wget -qO- --server-response http://localhost:3001/healthz 2>&1 \
    | awk '/HTTP\//{print $2}' | tail -1)
  if [ "$STATUS" = "200" ]; then
    echo "[deploy] Smoke test passed (HTTP 200)"
    break
  fi
  echo "[deploy] Smoke attempt $i: got '${STATUS:-no response}', retrying in 5s..."
  sleep 5
  if [ "$i" -eq 12 ]; then
    echo "[deploy] Smoke test FAILED after 60s"
    $COMPOSE logs --tail=30 server
    exit 1
  fi
done
