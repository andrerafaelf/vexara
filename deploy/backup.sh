#!/usr/bin/env bash
# Automated PostgreSQL backup for Vexara
# Install: crontab -e  →  0 2 * * * /opt/vexara/deploy/backup.sh >> /var/log/vx-backup.log 2>&1

set -euo pipefail

APP_DIR="/opt/vexara"
BACKUP_DIR="/opt/vexara/backups"
RETENTION_DAYS=14
TIMESTAMP=$(date +"%Y-%m-%dT%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/vexara_${TIMESTAMP}.sql.gz"

# Load env
source "$APP_DIR/.env"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup at $TIMESTAMP"

# Dump directly from the running postgres container
docker exec vx-postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-password \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[backup] Backup written: $BACKUP_FILE ($SIZE)"

# Prune old backups
find "$BACKUP_DIR" -name "vexara_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
REMAINING=$(find "$BACKUP_DIR" -name "vexara_*.sql.gz" | wc -l)
echo "[backup] Pruned old backups. $REMAINING backups retained."

echo "[backup] Done."
