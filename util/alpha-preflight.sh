#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ENV="$ROOT_DIR/server/.env"
ADMIN_ENV="$ROOT_DIR/admin-server/.env"

failures=0

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; failures=$((failures + 1)); }

require_file() {
  local path="$1"
  local label="$2"
  if [[ -f "$path" ]]; then
    pass "$label exists"
  else
    fail "$label missing ($path)"
  fi
}

require_file "$SERVER_ENV" "server env"
require_file "$ADMIN_ENV" "admin env"

if [[ -f "$SERVER_ENV" ]]; then
  if grep -q "very_long_random_secret_string\|your_postgres_connection_string\|replace_with" "$SERVER_ENV"; then
    fail "server env still contains placeholder values"
  else
    pass "server env has non-placeholder values"
  fi
fi

if [[ -f "$ADMIN_ENV" ]]; then
  if grep -q "your_admin_username\|your_admin_password\|replace_with" "$ADMIN_ENV"; then
    fail "admin env still contains placeholder values"
  else
    pass "admin env has non-placeholder values"
  fi
fi

if docker compose -f "$ROOT_DIR/util/docker-compose.yml" ps postgres | grep -q "Up"; then
  pass "postgres container is running"
else
  fail "postgres container is not running"
fi

if curl -fsS http://localhost:3001/healthz >/dev/null; then
  pass "server /healthz is reachable"
else
  fail "server /healthz failed"
fi

if curl -fsS http://localhost:3001/readyz >/dev/null; then
  pass "server /readyz is healthy"
else
  fail "server /readyz failed"
fi

if curl -fsS http://localhost:3002/healthz >/dev/null; then
  pass "admin-server /healthz is reachable"
else
  fail "admin-server /healthz failed"
fi

ADMIN_USER="$(grep '^ADMIN_USER=' "$ADMIN_ENV" | cut -d'=' -f2- || true)"
ADMIN_PASS="$(grep '^ADMIN_PASS=' "$ADMIN_ENV" | cut -d'=' -f2- || true)"

if [[ -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]]; then
  if curl -fsS -u "$ADMIN_USER:$ADMIN_PASS" http://localhost:3002/api/admin/stats >/dev/null; then
    pass "admin credentials authenticate"
  else
    fail "admin credentials rejected by /api/admin/stats"
  fi
else
  fail "admin credentials not found in admin env"
fi

if (cd "$ROOT_DIR/server" && npm test >/dev/null); then
  pass "server tests pass"
else
  fail "server tests failed"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "\nAlpha preflight failed with $failures issue(s)."
  exit 1
fi

echo "\nAlpha preflight passed."
