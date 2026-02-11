#!/usr/bin/env bash
set -euo pipefail

# Ensures the Go API is running in test mode.
# If already running on the target port, reuses it.
# If not, starts it and prints the PID to stdout (caller should clean up).
#
# Usage:
#   API_PID=$(./scripts/ensure-test-api.sh)
#   # API_PID is empty if server was already running, or the PID if we started it
#
# Environment:
#   API_PORT (default: 8080)
#   DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD

API_PORT=${API_PORT:-8080}
DB_HOST=${DATABASE_HOST:-localhost}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-eval}
DB_USER=${DATABASE_USER:-eval}
DB_PASS=${DATABASE_PASSWORD:-eval_local_password}

# Already running?
if curl -sf "http://localhost:${API_PORT}/healthz" >/dev/null 2>&1; then
  echo "" # empty PID = we didn't start it
  exit 0
fi

# Start the server
export AUTH_MODE=test
export DATABASE_HOST="$DB_HOST" DATABASE_PORT="$DB_PORT" DATABASE_NAME="$DB_NAME"
export DATABASE_USER="$DB_USER" DATABASE_PASSWORD="$DB_PASS"
export REDIS_URL=redis://localhost:6379
export CENTRIFUGO_URL=http://localhost:8000
export CENTRIFUGO_API_KEY=local-api-key
export CENTRIFUGO_TOKEN_SECRET=local-dev-secret-key-not-for-production
export GCP_PROJECT_ID=test-project
export PORT="$API_PORT"
if [ -x go-backend/tmp/server ]; then
  go-backend/tmp/server >&2 &
else
  (cd go-backend && go run ./cmd/server) >&2 &
fi
SERVER_PID=$!

# Wait for healthy
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${API_PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -sf "http://localhost:${API_PORT}/healthz" >/dev/null 2>&1; then
  echo "Go API failed to start on port ${API_PORT}" >&2
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

echo >&2 "Go API ready on port ${API_PORT} (PID ${SERVER_PID})"
echo "$SERVER_PID"
