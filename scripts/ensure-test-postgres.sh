#!/usr/bin/env bash
set -euo pipefail

DB_HOST=${DATABASE_HOST:-localhost}
DB_PORT=${DATABASE_PORT:-5432}

# Start docker services (postgres, redis, centrifugo) if not already running
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  echo "Starting docker services..."
  docker compose up -d postgres redis centrifugo --wait
fi

# Also ensure centrifugo is running (for E2E tests)
if ! curl -sf http://localhost:8000/health >/dev/null 2>&1; then
  echo "Starting Centrifugo..."
  docker compose up -d centrifugo --wait
fi

# Wait for ready (may have just started)
echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then break; fi
  sleep 1
done
pg_isready -h "$DB_HOST" -p "$DB_PORT" -q || { echo "Postgres not ready"; exit 1; }

DB_NAME=${DATABASE_NAME:-eval}
DB_USER=${DATABASE_USER:-eval}
DB_PASS=${DATABASE_PASSWORD:-eval_local_password}
PSQL_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Run migrations (idempotent — applied in order)
echo "Applying migrations..."
for f in migrations/*.up.sql; do
  psql "$PSQL_URL" -f "$f" 2>/dev/null || true
done

# Seed well-known contract test admin (idempotent)
psql "$PSQL_URL" -f scripts/contract-test-seed.sql

echo "Postgres is ready"
