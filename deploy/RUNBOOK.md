# Vexara, Production Runbook

## Architecture

```
Internet ── Cloudflare
   │
   ▼
[ OVH VPS, Ubuntu 26.04, 4 GB ]
   │
[ vx-nginx (container, owns 80/443) ]  ← TLS termination, rate limiting, static asset caching
   │
   ├──► vx-client        (Next.js, port 3000) , player UI
   ├──► vx-server        (Express, port 3001) , game API + background jobs
   ├──► vx-admin-client  (Next.js, port 3003) , admin UI
   ├──► vx-admin-server  (Express, port 3002) , admin API
   ├──► vx-postgres      (PostgreSQL 16)      , single database (internal only)
   ├──► vx-prometheus    (metrics collection)
   ├──► vx-loki          (log aggregation)
   ├──► vx-promtail      (log shipping)
   ├──► vx-grafana       (dashboards, admin.domain/grafana/)
   │
   │  Side sites on the same host (other repos, config lives here in deploy/nginx/):
   ├──► treble.quest          static files /var/www/treble-quest
   ├──► api.treble.quest, /r/ host systemd service treble-quest-api on 172.17.0.1:8787
   │                          (reached as host.docker.internal)
   └──► andrerfferreira.work  static files /opt/andrerfferreira-portfolio/current
```

All services communicate on the internal Docker `app_net` network.  
PostgreSQL is never exposed to the host, only reachable by other containers.

Rendered nginx and pgAdmin configs live in `/opt/vexara/runtime/` (not `deploy/`,
which CI wipes on every deploy). Each side site's server block is only rendered
when its cert exists, so a missing cert never takes down vexara.world.

---

## First-Time VPS Setup

```bash
# 1. DNS: point every hostname at the VPS with the Cloudflare proxy OFF (grey):
#    vexara.world, admin.vexara.world, treble.quest, www.treble.quest,
#    api.treble.quest, andrerfferreira.work, www.andrerfferreira.work

# 2. Copy the bootstrap script up and run it as root. It installs Docker, Node 22,
#    Certbot, UFW, fail2ban, swap, creates the deploy + trebleq users and dirs,
#    issues all four certs and adds the renew/backup crons.
scp deploy/bootstrap-vps.sh root@YOUR_VPS_IP:/root/
ssh root@YOUR_VPS_IP 'DEPLOY_PUBKEY="ssh-ed25519 AAAA... github-actions-deploy" bash /root/bootstrap-vps.sh vexara.world'

# 3. Set VPS_HOST, VPS_USER=deploy, VPS_SSH_KEY in all three repos
#    (vexara, treble-quest, andrerfferreira-portfolio).

# 4. Deploy Vexara first: Actions > CI/CD > Run workflow (tick rebuild_all if
#    the GHCR images are gone). CI writes .env and runs deploy/deploy.sh.

# 5. Deploy treble-quest and the portfolio (Run workflow, or push to main).

# 6. Turn the Cloudflare proxy back on for the proxied records.
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
| `ADMIN_ALLOW_IPS` | Comma-separated IP/CIDR allowlist for `admin.<domain>` |
| `VAPID_SUBJECT` | e.g. `mailto:admin@vexara.com` |

---

## Deploy Workflow

```
git push main
      │
      ▼
GitHub Actions: ci-cd.yml
  1. test    , TypeScript type-check + unit tests
  2. build   , Build 4 Docker images, push to GHCR with sha-<commit> tag
  3. deploy  , SSH to VPS, write .env, call deploy.sh
  4. smoke   , HTTP 200 on /healthz confirms deploy succeeded
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
sudo bash /opt/vexara/deploy/backup.sh   # root: reads /root/.secrets/r2-backup.env
ls /opt/vexara/backups/
```

### Restore a backup
Local copies are in `/opt/vexara/backups/` (last 7 days). Older ones come from R2
(`backups` bucket, `vexara/daily/` 30 days, `vexara/monthly/` 12 months).
Download one from the Cloudflare dashboard (R2 > bucket > object > Download) and
`scp` it to the VPS, then:
```bash
# Vexara: stop the game server first so nothing writes mid-restore.
# This replaces the current data; the dump recreates every table.
docker stop vx-server vx-admin-server
docker exec vx-postgres psql -U "$POSTGRES_USER" -d postgres \
  -c 'DROP DATABASE "<db>" WITH (FORCE);' -c 'CREATE DATABASE "<db>";'
gunzip -c vexara_YYYY-MM-DDTHH-MM-SSZ.sql.gz \
  | docker exec -i vx-postgres psql -U "$POSTGRES_USER" -d "<db>"
docker start vx-server vx-admin-server

# Treble Quest leaderboard
sudo systemctl stop treble-quest-api
gunzip -c treble-quest_YYYY-MM-DDTHH-MM-SSZ.db.gz \
  | sudo tee /opt/treble-quest/server/data/leaderboard.db > /dev/null
sudo rm -f /opt/treble-quest/server/data/leaderboard.db-wal /opt/treble-quest/server/data/leaderboard.db-shm
sudo chown trebleq:trebleq /opt/treble-quest/server/data/leaderboard.db
sudo systemctl start treble-quest-api
```
`POSTGRES_USER` / `POSTGRES_DB` are in `/opt/vexara/.env`.
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

Root cron on the VPS runs `deploy/backup.sh` daily at 02:00 (server time, UTC):
```
0 2 * * * /opt/vexara/deploy/backup.sh >> /var/log/vx-backup.log 2>&1
```
It backs up both stateful stores on the host: the Vexara Postgres DB (`pg_dump`)
and the Treble Quest leaderboard SQLite (online `.backup`, integrity-checked).

| Where | What | Kept |
|-------|------|------|
| `/opt/vexara/backups/` | every nightly file | 7 days |
| R2 `backups/<app>/daily/` | every nightly file | 30 days |
| R2 `backups/<app>/monthly/` | the 1st-of-month file | 12 months |

The R2 bucket is private and separate from the public `vexara-avatars` bucket.
Its credentials live only on the VPS in `/root/.secrets/r2-backup.env` (root-only,
written by `bootstrap-vps.sh`), not in GitHub. Check the last run with
`sudo tail -20 /var/log/vx-backup.log`; a failed run ends with `Done WITH ERRORS`.

---

## Security Checklist

- [ ] No `.env` committed to git (`.gitignore` covers it)
- [ ] PostgreSQL not exposed on host network
- [ ] Admin panel restricted by IP (`ADMIN_ALLOW_IPS` set in `.env`)
- [ ] UFW blocks all ports except 22, 80, 443
- [ ] fail2ban enabled for SSH brute-force protection
- [ ] JWT_SECRET is at least 64 random bytes
- [ ] ADMIN_PASS is strong and unique
- [ ] VAPID keys generated fresh (not from examples)
- [ ] Grafana password changed from default
- [ ] SSL auto-renewal confirmed: `certbot renew --dry-run`
