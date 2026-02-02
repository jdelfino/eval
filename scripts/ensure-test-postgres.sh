#!/usr/bin/env bash
set -euo pipefail

DB_HOST=${DATABASE_HOST:-localhost}
DB_PORT=${DATABASE_PORT:-5432}

# Start postgres if not already running
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  echo "Starting Postgres via docker-compose..."
  docker-compose up -d postgres --wait
fi

# Wait for ready (may have just started)
echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then break; fi
  sleep 1
done
pg_isready -h "$DB_HOST" -p "$DB_PORT" -q || { echo "Postgres not ready"; exit 1; }

# Run migrations
DB_NAME=${DATABASE_NAME:-eval}
DB_USER=${DATABASE_USER:-eval}
DB_PASS=${DATABASE_PASSWORD:-eval_local_password}
PSQL_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Seed well-known contract test admin (idempotent)
psql "$PSQL_URL" -f scripts/contract-test-seed.sql

echo "Postgres is ready"
