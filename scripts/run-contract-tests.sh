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

# --- 2. Start Go API on random port ---
API_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')
export API_PORT
SERVER_PID=$(./scripts/ensure-test-api.sh)

# --- 3. Generate random namespace ---
NS="contract-$(openssl rand -hex 4)"

cleanup() {
  # Clean up test data (namespace cascades)
  psql "$PSQL_URL" -c "DELETE FROM namespaces WHERE id = '${NS}';" 2>/dev/null || true
  # Kill only our server
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# --- 4. Run contract tests ---
cd frontend
API_BASE_URL="http://localhost:${API_PORT}" CONTRACT_NS="$NS" \
  npx jest --selectProjects contract --no-coverage --runInBand
