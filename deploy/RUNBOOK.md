# Vexara — Production Runbook

## Architecture

```
Internet
   │
   ▼
[ Hetzner VPS ]
   │
[ Nginx (host) ]  ← TLS termination, rate limiting, static asset caching
   │
   ├──► vx-client        (Next.js, port 3000)  — player UI
   ├──► vx-server        (Express, port 3001)  — game API + background jobs
   ├──► vx-admin-client  (Next.js, port 3003)  — admin UI
   ├──► vx-admin-server  (Express, port 3002)  — admin API
   ├──► vx-postgres      (PostgreSQL 16)       — single database (internal only)
   ├──► vx-prometheus    (metrics collection)
   ├──► vx-loki          (log aggregation)
   ├──► vx-promtail      (log shipping)
   └──► vx-grafana       (dashboards — admin.domain/grafana/)
```

All services communicate on the internal Docker `app_net` network.  
PostgreSQL is never exposed to the host — only reachable by other containers.

---

## First-Time VPS Setup

```bash
# 1. SSH into your fresh Hetzner VPS as root
ssh root@YOUR_VPS_IP

# 2. Clone the repo (or scp bootstrap script)
git clone https://github.com/YOUR_USERNAME/Vexara.git /opt/vexara
cd /opt/vexara

# 3. Run bootstrap (installs Docker, Nginx, Certbot, UFW, creates deploy user)
bash deploy/bootstrap-vps.sh yourdomain.com

# 4. Generate secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"  # JWT_SECRET
npx web-push generate-vapid-keys                                           # VAPID keys

# 5. Create the production .env
cp .env.production.example .env
nano .env    # fill in every CHANGE_ME value

# 6. Trigger first deploy via GitHub Actions push to main
# OR manually:
bash deploy/deploy.sh latest
```

---

## GitHub Actions Secrets & Variables

Set these in your repo → Settings → Secrets and variables → Actions.

### Secrets (encrypted)
| Name | Description |
|------|-------------|
| `VPS_HOST` | VPS IP address or hostname |
| `VPS_USER` | SSH user (e.g. `deploy`) |
| `VPS_SSH_KEY` | Private SSH key (the deploy user's key) |
| `POSTGRES_USER` | DB username |
| `POSTGRES_PASSWORD` | DB password (strong random) |
| `POSTGRES_DB` | Database name (e.g. `vexara`) |
| `JWT_SECRET` | 64-byte hex string |
| `ADMIN_USER` | Admin panel username |
| `ADMIN_PASS` | Admin panel password |
| `VAPID_PUBLIC_KEY` | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web push VAPID private key |
| `GRAFANA_PASSWORD` | Grafana admin password |

### Variables (non-secret)
| Name | Description |
|------|-------------|
| `DOMAIN` | e.g. `vexara.com` |
| `CORS_ORIGINS` | e.g. `https://vexara.com` |
| `ADMIN_CORS_ORIGINS` | e.g. `https://admin.vexara.com` |
| `VAPID_SUBJECT` | e.g. `mailto:admin@vexara.com` |

---

## Deploy Workflow

```
git push main
      │
      ▼
GitHub Actions: ci-cd.yml
  1. test     — TypeScript type-check + unit tests
  2. build    — Build 4 Docker images, push to GHCR with sha-<commit> tag
  3. deploy   — SSH to VPS, write .env, call deploy.sh
  4. smoke    — HTTP 200 on /healthz confirms deploy succeeded
```

Push to `main` = deploy. Use PRs to develop safely before merging.

---

## Common Operations

### View live logs
```bash
# All services
docker compose -f /opt/vexara/docker-compose.prod.yml logs -f

# Single service
docker compose -f /opt/vexara/docker-compose.prod.yml logs -f server
```

### Manual deploy (without CI)
```bash
cd /opt/vexara
IMAGE_TAG=sha-abc1234 bash deploy/deploy.sh sha-abc1234
```

### Rollback to previous image
```bash
cd /opt/vexara
# List available tags in GHCR, then:
IMAGE_TAG=sha-<previous-commit> bash deploy/deploy.sh sha-<previous-commit>
```

### Database backup (manual)
```bash
bash /opt/vexara/deploy/backup.sh
ls /opt/vexara/backups/
```

### Restore a backup
```bash
gunzip -c /opt/vexara/backups/vexara_YYYY-MM-DDTHH-MM-SS.sql.gz \
  | docker exec -i vx-postgres psql -U neon -d vexara
```

### Run Prisma migrations manually
```bash
docker exec vx-server npx prisma migrate deploy
```

### Reload Nginx config
```bash
nginx -t && nginx -s reload
```

### Renew SSL certificates
```bash
certbot renew --dry-run  # test
certbot renew            # real run (cron does this automatically)
```

---

## Monitoring & Observability

| Tool | URL | Purpose |
|------|-----|---------|
| Grafana | `https://admin.yourdomain.com/grafana/` | Dashboards & alerts |
| Prometheus | internal only (port 9090) | Metrics scraping |
| Loki | internal only (port 3100) | Log storage |
| Game healthcheck | `https://yourdomain.com/healthz` | Uptime monitoring |

Add your domain to an external uptime monitor (UptimeRobot free tier, Better Stack, etc.) pointing to `/healthz`.

---

## Incident Response

### Service won't start
```bash
docker compose -f /opt/vexara/docker-compose.prod.yml logs --tail=100 <service>
docker compose -f /opt/vexara/docker-compose.prod.yml ps
```

### Database connection errors
```bash
docker exec vx-postgres pg_isready -U neon -d vexara
docker compose -f /opt/vexara/docker-compose.prod.yml restart postgres
```

### Disk full
```bash
df -h
docker system prune -f          # clean stopped containers, unused images
docker volume ls                 # check volumes
```

### Out of memory
```bash
free -h
docker stats --no-stream        # per-container memory
```

---

## Backup Schedule

Cron on VPS runs daily at 02:00:
```
0 2 * * * /opt/vexara/deploy/backup.sh >> /var/log/vx-backup.log 2>&1
```
14 days of backups are kept in `/opt/vexara/backups/`.  
For off-site backup, configure an S3-compatible object store (Hetzner Object Storage) and `aws s3 cp` from the backup script.

---

## Security Checklist

- [ ] No `.env` committed to git (`.gitignore` covers it)
- [ ] PostgreSQL not exposed on host network
- [ ] Admin panel restricted by IP (uncomment `allow/deny` in nginx.conf)
- [ ] UFW blocks all ports except 22, 80, 443
- [ ] fail2ban enabled for SSH brute-force protection
- [ ] JWT_SECRET is at least 64 random bytes
- [ ] ADMIN_PASS is strong and unique
- [ ] VAPID keys generated fresh (not from examples)
- [ ] Grafana password changed from default
- [ ] SSL auto-renewal confirmed: `certbot renew --dry-run`
