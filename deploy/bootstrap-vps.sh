#!/usr/bin/env bash
# Bootstrap a fresh Ubuntu VPS (22.04+, used on OVH Ubuntu 26.04) as the shared
# host for three sites. Vexara's nginx container is the only public edge
# (ports 80/443) and serves all of them:
#
#   Vexara        vexara.world, admin.vexara.world    Docker stack in /opt/vexara
#   Treble Quest  treble.quest, www., api.            static site in /var/www/treble-quest
#                                                     + leaderboard API (systemd, host)
#   Portfolio     andrerfferreira.work, www.          static site in /opt/andrerfferreira-portfolio
#
# Run as root:  bash bootstrap-vps.sh vexara.world
# Optional env: DEPLOY_PUBKEY="ssh-ed25519 ..."  CI deploy key for the deploy user
#               CERT_EMAIL=you@example.com        Let's Encrypt account email
#               CF_API_TOKEN=...                  Cloudflare token (Zone DNS Edit)
#               BACKUP_R2_ACCESS_KEY_ID=... BACKUP_R2_SECRET_ACCESS_KEY=...
#               BACKUP_R2_ACCOUNT_ID=... BACKUP_R2_BUCKET=...
#                                                 private R2 bucket for off-site backups
# The script is idempotent, safe to re-run.
#
# Certificates:
#   With CF_API_TOKEN (preferred): DNS-01 via certbot-dns-cloudflare. Works with
#   the Cloudflare proxy on or off, and renewals need nothing from nginx. The
#   token is kept in /root/.secrets/cloudflare.ini for renewals.
#   Without it: HTTP-01. Every hostname must resolve to this VPS with the
#   Cloudflare proxy OFF (grey cloud) for the first issue; renewals then go
#   through the nginx container's /.well-known/acme-challenge/ location.

set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <your-domain.com>"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

DEPLOY_USER="deploy"
APP_DIR="/opt/vexara"
TREBLE_USER="trebleq"
TREBLE_APP_DIR="/opt/treble-quest"
TREBLE_SITE_DIR="/var/www/treble-quest"
PORTFOLIO_DIR="/opt/andrerfferreira-portfolio"
CERT_EMAIL="${CERT_EMAIL:-admin@${DOMAIN}}"
# docker0 gateway. The Treble API binds here and the nginx container reaches
# it as host.docker.internal (extra_hosts: host-gateway).
DOCKER_GATEWAY="172.17.0.1"

echo "==> Updating system packages..."
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl git ufw fail2ban unzip rsync ca-certificates build-essential psmisc \
  rclone sqlite3

# ─── Docker ───────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "==> Docker already installed, skipping."
fi

if ! docker compose version &>/dev/null; then
  echo "==> Installing Docker Compose plugin..."
  apt-get install -yq docker-compose-plugin
else
  echo "==> Docker Compose already installed, skipping."
fi

# ─── Node 22 (Treble Quest leaderboard API runs on the host) ─────────────────
if ! command -v node &>/dev/null || ! node -v | grep -q '^v22'; then
  echo "==> Installing Node 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
else
  echo "==> Node 22 already installed, skipping."
fi

# ─── Certbot ─────────────────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "==> Installing Certbot..."
  apt-get install -yq snapd
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
else
  echo "==> Certbot already installed, skipping."
fi

# ─── Firewall ────────────────────────────────────────────────────────────────
echo "==> Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# Let the nginx container (any Docker bridge network) reach the host Treble API.
# Nothing else can: the API only listens on the docker0 gateway.
ufw allow proto tcp from 172.16.0.0/12 to "$DOCKER_GATEWAY" port 8787 comment 'treble api from docker nginx'
ufw --force enable

# ─── Fail2ban ────────────────────────────────────────────────────────────────
echo "==> Configuring fail2ban..."
systemctl enable --now fail2ban

# ─── Deploy user (all three repos' CI SSH in as this user) ───────────────────
if ! id "$DEPLOY_USER" &>/dev/null; then
  echo "==> Creating deploy user..."
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
else
  echo "==> Deploy user already exists."
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /home/"$DEPLOY_USER"/.ssh
AUTH_KEYS=/home/"$DEPLOY_USER"/.ssh/authorized_keys
touch "$AUTH_KEYS"
if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  grep -qxF "$DEPLOY_PUBKEY" "$AUTH_KEYS" || echo "$DEPLOY_PUBKEY" >> "$AUTH_KEYS"
elif [ ! -s "$AUTH_KEYS" ] && [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys "$AUTH_KEYS"
fi
chown "$DEPLOY_USER":"$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

# Treble Quest's CI writes to /etc, /opt, /var/www and manages systemd, and
# Vexara's deploy writes pgpass as UID 5050. Membership of the docker group is
# already root-equivalent, so passwordless sudo adds no real privilege.
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/90-deploy
chmod 0440 /etc/sudoers.d/90-deploy
visudo -cf /etc/sudoers.d/90-deploy

# ─── App directories ─────────────────────────────────────────────────────────
echo "==> Setting up app directories..."
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/runtime"

# Treble Quest: service user, API dir, static site dir
if ! id "$TREBLE_USER" &>/dev/null; then
  useradd --system --create-home --shell /usr/sbin/nologin "$TREBLE_USER"
fi
install -d -o "$TREBLE_USER" -g "$TREBLE_USER" "$TREBLE_APP_DIR" "$TREBLE_APP_DIR/server" "$TREBLE_APP_DIR/server/data"
install -d -m 755 "$TREBLE_SITE_DIR"

# Portfolio: CI extracts releases here and repoints "current"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$PORTFOLIO_DIR" "$PORTFOLIO_DIR/releases"
if [ ! -e "$PORTFOLIO_DIR/current" ]; then
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$PORTFOLIO_DIR/releases/bootstrap"
  printf '%s\n' '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Andre Ferreira</title></head><body>Deploy pending.</body></html>' \
    > "$PORTFOLIO_DIR/releases/bootstrap/index.html"
  ln -sfn "$PORTFOLIO_DIR/releases/bootstrap" "$PORTFOLIO_DIR/current"
  chown -h -R "$DEPLOY_USER":"$DEPLOY_USER" "$PORTFOLIO_DIR"
fi

# ─── SSL certificates ────────────────────────────────────────────────────────
mkdir -p /var/www/certbot
CF_INI=/root/.secrets/cloudflare.ini

if [ -n "${CF_API_TOKEN:-}" ]; then
  install -d -m 700 /root/.secrets
  ( umask 077; printf 'dns_cloudflare_api_token = %s\n' "$CF_API_TOKEN" > "$CF_INI" )
fi

if [ -f "$CF_INI" ]; then
  echo "==> Using DNS-01 via Cloudflare for certificates..."
  snap set certbot trust-plugin-with-root=ok
  snap list certbot-dns-cloudflare &>/dev/null || snap install certbot-dns-cloudflare
  snap connect certbot:plugin certbot-dns-cloudflare 2>/dev/null || true
  CERT_METHOD=(--dns-cloudflare --dns-cloudflare-credentials "$CF_INI" --dns-cloudflare-propagation-seconds 30)
  RENEW_ARGS=""
elif docker ps --format '{{.Names}}' | grep -qx vx-nginx; then
  # Re-run with the stack up: the nginx container serves the webroot.
  CERT_METHOD=(--webroot -w /var/www/certbot)
  RENEW_ARGS="--webroot -w /var/www/certbot"
else
  # First run: nothing listens on 80, so use certbot's standalone server.
  systemctl stop nginx 2>/dev/null || true
  CERT_METHOD=(--standalone)
  RENEW_ARGS="--webroot -w /var/www/certbot"
fi

issue_cert() {
  local NAME="$1"; shift
  certbot certonly "${CERT_METHOD[@]}" --cert-name "$NAME" "$@" \
    --non-interactive --agree-tos -m "$CERT_EMAIL" --keep-until-expiring
}

echo "==> Obtaining SSL certificates..."
# The main cert is required: deploy.sh refuses to run without it.
issue_cert "$DOMAIN" -d "$DOMAIN" -d "www.${DOMAIN}"
# Side sites get their own lineage so a DNS problem with one can't block the others.
issue_cert "admin.${DOMAIN}" -d "admin.${DOMAIN}" \
  || echo "==> WARN: admin.${DOMAIN} cert not issued, check its DNS points here"
issue_cert treble.quest -d treble.quest -d www.treble.quest -d api.treble.quest \
  || echo "==> WARN: treble.quest cert not issued, check treble.quest / www / api DNS point here"
issue_cert andrerfferreira.work -d andrerfferreira.work -d www.andrerfferreira.work \
  || echo "==> WARN: andrerfferreira.work cert not issued, check its DNS points here"

# Let non-root processes (deploy user, nginx container running as nginx UID)
# traverse the letsencrypt dirs. Private key files inside archive/ stay 0600.
chmod 0755 /etc/letsencrypt/live /etc/letsencrypt/archive 2>/dev/null || true

# Disable host nginx so it never races the container for port 80
systemctl disable --now nginx 2>/dev/null || true

# ─── Auto-renew ───────────────────────────────────────────────────────────────
# DNS-01 lineages renew with their stored authenticator. For HTTP-01, passing
# --webroot on renew also rewrites each lineage's renewal config away from
# standalone after its first successful renewal.
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-vx-nginx.sh <<'HOOKEOF'
#!/bin/sh
# Reload nginx in place (no restart = zero downtime) after any cert renewal.
docker kill --signal=HUP vx-nginx >/dev/null 2>&1 || true
HOOKEOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-vx-nginx.sh

# ─── Off-site backup credentials (read by deploy/backup.sh) ──────────────────
if [ -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ]; then
  install -d -m 700 /root/.secrets
  ( umask 077
    printf 'BACKUP_R2_ACCOUNT_ID=%s\nBACKUP_R2_ACCESS_KEY_ID=%s\nBACKUP_R2_SECRET_ACCESS_KEY=%s\nBACKUP_R2_BUCKET=%s\n' \
      "$BACKUP_R2_ACCOUNT_ID" "$BACKUP_R2_ACCESS_KEY_ID" "$BACKUP_R2_SECRET_ACCESS_KEY" "$BACKUP_R2_BUCKET" \
      > /root/.secrets/r2-backup.env )
fi

echo "==> Adding cron jobs (cert renewal, nightly backups)..."
(crontab -l 2>/dev/null | grep -v 'certbot renew' | grep -v 'deploy/backup.sh' || true
 echo "0 3 * * * certbot renew --quiet ${RENEW_ARGS}"
 echo "0 2 * * * $APP_DIR/deploy/backup.sh >> /var/log/vx-backup.log 2>&1") \
  | crontab -

# ─── Log rotation for docker json-file logs ──────────────────────────────────
cat > /etc/logrotate.d/docker-containers <<'LOGEOF'
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    missingok
    delaycompress
    copytruncate
}
LOGEOF

# ─── Swap (recommended for 2-4 GB VPS) ──────────────────────────────────────
if [ ! -f /swapfile ]; then
  echo "==> Creating 2G swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ""
echo "====================================================="
echo " Bootstrap complete for $DOMAIN"
echo "====================================================="
echo ""
certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || true
echo ""
echo "Next steps:"
echo "  1. Set VPS_HOST / VPS_USER=$DEPLOY_USER / VPS_SSH_KEY secrets in all three repos"
echo "  2. Deploy Vexara first (Actions > CI/CD > Run workflow): it brings up the nginx edge"
echo "  3. Then deploy treble-quest and andrerfferreira-portfolio (push to main or Run workflow)"
echo "  4. Turn the Cloudflare proxy back on (orange cloud) for the proxied records"
echo ""
