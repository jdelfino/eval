#!/usr/bin/env bash
set -euo pipefail

# Builds and starts the Go API on a caller-specified port.
# Skips the Go build if the binary already exists (cache-aware).
# Prints the PID to stdout — the caller MUST clean up (kill) when done.
#
# Usage:
#   export API_PORT=<random-port>
#   SERVER_PID=$(./scripts/ensure-test-api.sh)
#
# Environment:
#   API_PORT (required)
#   FIREBASE_AUTH_EMULATOR_HOST (required) — the Go backend uses Firebase
#     validator which auto-detects this env var and accepts emulator tokens.
#     Example: FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
#   DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD
#   DOCKER_HOST_IP — set in container jobs to reach host-side services

# Docker compose services run on the host. In container jobs, use DOCKER_HOST_IP.
HOST=${DOCKER_HOST_IP:-localhost}

API_PORT=${API_PORT:?API_PORT must be set}
FIREBASE_AUTH_EMULATOR_HOST=${FIREBASE_AUTH_EMULATOR_HOST:?FIREBASE_AUTH_EMULATOR_HOST must be set}
DB_HOST=${DATABASE_HOST:-${HOST}}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-eval}
DB_USER=${DATABASE_USER:-eval}
DB_PASS=${DATABASE_PASSWORD:-eval_local_password}

if [ -f go-backend/tmp/server ]; then
  echo "Go server binary exists, skipping build" >&2
else
  echo "Building Go server..." >&2
  (cd go-backend && mkdir -p tmp && go build -o ./tmp/server ./cmd/server)
fi

# Start the server using Firebase validator.
# The Admin SDK auto-detects FIREBASE_AUTH_EMULATOR_HOST and trusts emulator tokens.
# GCP_PROJECT_ID must match the emulator's project ("demo-test").
# BOOTSTRAP_ADMIN_EMAIL allows tests to bootstrap a system admin via the emulator.
echo "Firebase emulator mode: using Firebase validator with FIREBASE_AUTH_EMULATOR_HOST=${FIREBASE_AUTH_EMULATOR_HOST}" >&2
export GCP_PROJECT_ID=demo-test
export BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local
# FIREBASE_AUTH_EMULATOR_HOST is inherited from the caller's environment
export DATABASE_HOST="$DB_HOST" DATABASE_PORT="$DB_PORT" DATABASE_NAME="$DB_NAME"
export DATABASE_USER="$DB_USER" DATABASE_PASSWORD="$DB_PASS"
export EXECUTOR_URL="http://${HOST}:8081"
export REDIS_URL="redis://${HOST}:6379"
export CENTRIFUGO_URL="http://${HOST}:8000"
export CENTRIFUGO_API_KEY=local-api-key
export CENTRIFUGO_TOKEN_SECRET=local-dev-secret-key-not-for-production
export PORT="$API_PORT"
go-backend/tmp/server >&2 &
SERVER_PID=$!

# Wait for healthy
for i in $(seq 1 30); do
  if curl -sf --max-time 3 "http://localhost:${API_PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -sf --max-time 3 "http://localhost:${API_PORT}/healthz" >/dev/null 2>&1; then
  echo "Go API failed to start on port ${API_PORT}" >&2
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

echo >&2 "Go API ready on port ${API_PORT} (PID ${SERVER_PID})"
echo "$SERVER_PID"
