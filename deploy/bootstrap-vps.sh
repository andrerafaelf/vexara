#!/usr/bin/env bash
# Bootstrap a fresh Hetzner VPS (Ubuntu 22.04/24.04) for Vexara
# Run as root: bash bootstrap-vps.sh yourdomain.com
# The script is idempotent — safe to re-run.

set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <your-domain.com>"
  exit 1
fi

DEPLOY_USER="deploy"
APP_DIR="/opt/vexara"

echo "==> Updating system packages..."
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl git ufw fail2ban unzip

# ─── Docker ───────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "==> Docker already installed, skipping."
fi

# ─── Docker Compose (plugin) ─────────────────────────────────────────────────
if ! docker compose version &>/dev/null; then
  echo "==> Installing Docker Compose plugin..."
  DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"
  mkdir -p "$DOCKER_CONFIG/cli-plugins"
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
  chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
else
  echo "==> Docker Compose already installed, skipping."
fi

# ─── Certbot (standalone — issues certs before the stack starts) ──────────────
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
ufw --force enable

# ─── Fail2ban ────────────────────────────────────────────────────────────────
echo "==> Configuring fail2ban..."
systemctl enable --now fail2ban

# ─── Deploy user ─────────────────────────────────────────────────────────────
if ! id "$DEPLOY_USER" &>/dev/null; then
  echo "==> Creating deploy user..."
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
  mkdir -p /home/"$DEPLOY_USER"/.ssh
  if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys /home/"$DEPLOY_USER"/.ssh/authorized_keys
    chown -R "$DEPLOY_USER":"$DEPLOY_USER" /home/"$DEPLOY_USER"/.ssh
    chmod 700 /home/"$DEPLOY_USER"/.ssh
    chmod 600 /home/"$DEPLOY_USER"/.ssh/authorized_keys
  fi
else
  echo "==> Deploy user already exists, skipping."
fi

# ─── App directory ───────────────────────────────────────────────────────────
echo "==> Setting up app directory $APP_DIR..."
mkdir -p "$APP_DIR"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

# ─── SSL certificates ────────────────────────────────────────────────────────
# Ensure nothing holds port 80 (old nginx binary, prior certbot run, etc.)
echo "==> Freeing port 80 before ACME challenge..."
systemctl stop nginx 2>/dev/null || true
fuser -k 80/tcp 2>/dev/null || true

mkdir -p /var/www/certbot

echo "==> Obtaining SSL certificates..."
certbot certonly --standalone \
  -d "${DOMAIN}" \
  -d "admin.${DOMAIN}" \
  --non-interactive --agree-tos -m "admin@${DOMAIN}" \
  --keep-until-expiring

# Disable host nginx so it never races the container for port 80
systemctl disable --now nginx 2>/dev/null || true

# Pre-generate nginx configs from templates so they exist before first deploy
sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" \
  "$APP_DIR/deploy/nginx/nginx.conf.template" \
  > "$APP_DIR/deploy/nginx/nginx.conf"
sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" \
  "$APP_DIR/deploy/nginx/admin.conf.template" \
  > "$APP_DIR/deploy/nginx/admin.conf"

# ─── Auto-renew: webroot mode — nginx container serves the challenge ──────────
# No port conflicts; certbot writes to /var/www/certbot, nginx serves it.
# After renewal, send nginx a reload signal (no restart = zero downtime).
echo "==> Adding certbot renewal cron..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --webroot -w /var/www/certbot && docker kill --signal=HUP vx-nginx") \
  | sort -u | crontab -

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

# ─── Swap (recommended for 2–4 GB VPS) ──────────────────────────────────────
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
echo "Next steps:"
echo "  1. Upload your .env file to $APP_DIR/.env"
echo "  2. Push to main — GitHub Actions will deploy automatically"
echo "  OR manually: cd $APP_DIR && bash deploy/deploy.sh latest"
echo ""
