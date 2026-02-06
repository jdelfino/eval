#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
DB_HOST=${DATABASE_HOST:-localhost}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-eval}
DB_USER=${DATABASE_USER:-eval}
DB_PASS=${DATABASE_PASSWORD:-eval_local_password}
PSQL_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# --- 1. Ensure Postgres is running + admin seeded ---
./scripts/ensure-test-postgres.sh

# --- 2. Start Go API on port 8080 ---
API_PORT=${API_PORT:-8080}

AUTH_MODE=test \
DATABASE_HOST="$DB_HOST" DATABASE_PORT="$DB_PORT" DATABASE_NAME="$DB_NAME" \
DATABASE_USER="$DB_USER" DATABASE_PASSWORD="$DB_PASS" \
CENTRIFUGO_TOKEN_SECRET=test-e2e-secret \
GCP_PROJECT_ID=test-project \
PORT="$API_PORT" \
  go run ./go-backend/cmd/server &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for healthy
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${API_PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "http://localhost:${API_PORT}/healthz" >/dev/null || { echo "Server failed to start"; exit 1; }

# --- 3. Run E2E tests ---
cd frontend
NEXT_PUBLIC_AUTH_MODE=test \
NEXT_PUBLIC_API_URL="http://localhost:${API_PORT}" \
API_BASE_URL="http://localhost:${API_PORT}" \
  npx playwright test "$@"
