#!/usr/bin/env bash
set -euo pipefail

# Run realtime event contract tests.
#
# These tests subscribe to Centrifugo WebSocket channels, trigger backend actions via REST,
# and verify that received event payloads match the TypeScript interfaces.
#
# Infrastructure required (in addition to what contract tests need):
#   - Centrifugo running at localhost:8000

# --- Config ---
DB_HOST=${DATABASE_HOST:-localhost}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-eval}
DB_USER=${DATABASE_USER:-eval}
DB_PASS=${DATABASE_PASSWORD:-eval_local_password}
PSQL_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
CENTRIFUGO_TOKEN_SECRET=${CENTRIFUGO_TOKEN_SECRET:-local-dev-secret-key-not-for-production}
CENTRIFUGO_API_KEY=${CENTRIFUGO_API_KEY:-local-api-key}

# --- 1. Ensure infrastructure is running ---
./scripts/ensure-test-postgres.sh

# Start Centrifugo if not already running
if ! curl -sf http://localhost:8000/health >/dev/null 2>&1; then
  echo "Starting Centrifugo..."
  docker compose up -d centrifugo --wait
fi

# Executor: reuse if already healthy
if ! curl -sf http://localhost:8081/healthz >/dev/null 2>&1; then
  echo "Starting executor..."
  docker compose up -d executor --build --wait
fi

# --- 2. Start Go API on random port ---
export API_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')
SERVER_PID=$(./scripts/ensure-test-api.sh)

# --- 3. Generate random namespace ---
NS="rt-contract-$(openssl rand -hex 4)"

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

# --- 4. Run realtime contract tests ---
cd frontend
API_BASE_URL="http://localhost:${API_PORT}" \
CONTRACT_NS="$NS" \
CENTRIFUGO_URL="http://localhost:8000" \
CENTRIFUGO_WS_URL="ws://localhost:8000/connection/websocket" \
CENTRIFUGO_TOKEN_SECRET="$CENTRIFUGO_TOKEN_SECRET" \
CENTRIFUGO_API_KEY="$CENTRIFUGO_API_KEY" \
  npx jest --selectProjects realtime-contract --no-coverage --runInBand
