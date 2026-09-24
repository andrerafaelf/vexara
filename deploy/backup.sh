#!/usr/bin/env bash
# Nightly backup of everything stateful on the shared VPS:
#   - Vexara PostgreSQL              pg_dump from vx-postgres
#   - Treble Quest leaderboard SQLite online .backup (safe while the API runs)
#
# Local copies live in $BACKUP_DIR for LOCAL_RETENTION_DAYS.
# Off-site: when /root/.secrets/r2-backup.env exists, every file is uploaded to
# a private R2 bucket under <app>/daily/ (kept REMOTE_DAILY_DAYS) and, on the
# 1st of each month, also under <app>/monthly/ (kept REMOTE_MONTHLY_DAYS).
# r2-backup.env holds BACKUP_R2_ACCOUNT_ID, BACKUP_R2_ACCESS_KEY_ID,
# BACKUP_R2_SECRET_ACCESS_KEY and BACKUP_R2_BUCKET (never the public avatars
# bucket). bootstrap-vps.sh writes it.
#
# Runs as root from cron (bootstrap-vps.sh installs it):
#   0 2 * * * /opt/vexara/deploy/backup.sh >> /var/log/vx-backup.log 2>&1
# Restore steps: deploy/RUNBOOK.md, "Restore a backup".

set -euo pipefail

APP_DIR="/opt/vexara"
BACKUP_DIR="$APP_DIR/backups"
TREBLE_DB="/opt/treble-quest/server/data/leaderboard.db"
R2_ENV="/root/.secrets/r2-backup.env"
LOCAL_RETENTION_DAYS=7
REMOTE_DAILY_DAYS=30
REMOTE_MONTHLY_DAYS=365
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
FAILED=0
FILES=()

log() { echo "[backup] $(date -u +%FT%TZ) $*"; }

# Literal KEY=VALUE parse: sourcing would let bash execute special chars in secrets
load_env() {
  while IFS='=' read -r key value; do
    case "$key" in ''|\#*) continue ;; esac
    export "$key=$value"
  done < "$1"
}

load_env "$APP_DIR/.env"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# ─── Vexara PostgreSQL ────────────────────────────────────────────────────────
backup_vexara() {
  local out="$BACKUP_DIR/vexara_${TIMESTAMP}.sql.gz"
  log "Dumping Vexara database..."
  # Explicit checks: set -e is suspended inside a function called with ||
  if ! docker exec vx-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-password \
      | gzip > "$out" || ! gzip -t "$out"; then
    rm -f "$out"
    return 1
  fi
  log "Wrote $out ($(du -h "$out" | cut -f1))"
  FILES+=("vexara:$out")
}

# ─── Treble Quest leaderboard (SQLite, WAL) ───────────────────────────────────
backup_treble() {
  if [ ! -f "$TREBLE_DB" ]; then
    log "WARN: $TREBLE_DB not found, skipping Treble Quest"
    return 0
  fi
  local out="$BACKUP_DIR/treble-quest_${TIMESTAMP}.db.gz"
  local tmp
  tmp="$(mktemp "$BACKUP_DIR/.treble-XXXXXX.db")"
  log "Snapshotting Treble Quest leaderboard..."
  if sqlite3 "$TREBLE_DB" ".backup '$tmp'" \
      && [ "$(sqlite3 "$tmp" 'PRAGMA integrity_check;')" = "ok" ]; then
    gzip -c "$tmp" > "$out"
    rm -f "$tmp"
    log "Wrote $out ($(du -h "$out" | cut -f1))"
    FILES+=("treble-quest:$out")
  else
    rm -f "$tmp"
    return 1
  fi
}

# One failing app must not skip the other
backup_vexara || { log "ERROR: Vexara dump failed"; FAILED=1; }
backup_treble || { log "ERROR: Treble Quest snapshot failed"; FAILED=1; }

# ─── Off-site copy to R2 ──────────────────────────────────────────────────────
if [ -f "$R2_ENV" ]; then
  load_env "$R2_ENV"
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  DEST="r2:${BACKUP_R2_BUCKET}"

  for entry in "${FILES[@]}"; do
    app="${entry%%:*}"
    file="${entry#*:}"
    name="$(basename "$file")"
    if rclone copyto -q "$file" "$DEST/$app/daily/$name"; then
      log "Uploaded $app/daily/$name"
    else
      log "ERROR: upload of $name to R2 failed"
      FAILED=1
      continue
    fi
    if [ "$(date -u +%d)" = "01" ]; then
      rclone copyto -q "$file" "$DEST/$app/monthly/$name" \
        && log "Uploaded $app/monthly/$name" \
        || { log "ERROR: monthly upload of $name failed"; FAILED=1; }
    fi
  done

  for app in vexara treble-quest; do
    rclone delete -q "$DEST/$app/daily" --min-age "${REMOTE_DAILY_DAYS}d" 2>/dev/null || true
    rclone delete -q "$DEST/$app/monthly" --min-age "${REMOTE_MONTHLY_DAYS}d" 2>/dev/null || true
  done
  log "Pruned R2: daily > ${REMOTE_DAILY_DAYS}d, monthly > ${REMOTE_MONTHLY_DAYS}d"
else
  log "WARN: $R2_ENV missing, backups are LOCAL ONLY (lost with the VPS)"
fi

# ─── Local prune ──────────────────────────────────────────────────────────────
find "$BACKUP_DIR" -maxdepth 1 \( -name 'vexara_*.sql.gz' -o -name 'treble-quest_*.db.gz' \) \
  -mtime +"$LOCAL_RETENTION_DAYS" -delete
log "Local backups retained: $(find "$BACKUP_DIR" -maxdepth 1 -name '*.gz' | wc -l)"

if [ "$FAILED" -ne 0 ]; then
  log "Done WITH ERRORS"
  exit 1
fi
log "Done."
