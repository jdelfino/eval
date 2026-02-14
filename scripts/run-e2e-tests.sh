#!/usr/bin/env bash
set -euo pipefail

# E2E test runner.
#
# Infrastructure (postgres, redis, centrifugo, executor) is shared on fixed
# ports — started only if not already healthy.
#
# Go API is per-run on a random port (different branches may have different
# code). Next.js proxies to the Go API via API_PROXY_URL.

NEXT_PORT=3000

PIDS_TO_KILL=()
cleanup() {
  for pid in "${PIDS_TO_KILL[@]}"; do
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

# --- 1. Shared infrastructure ---
./scripts/ensure-test-postgres.sh

if ! curl -sf http://localhost:8081/healthz >/dev/null 2>&1; then
  echo "Starting executor..."
  docker compose up -d executor --build --wait
fi

# --- 2. Go API on random port (builds binary if needed) ---
export API_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')
SERVER_PID=$(./scripts/ensure-test-api.sh)
PIDS_TO_KILL+=("$SERVER_PID")

# --- 3. Next.js ---
if curl -sf "http://localhost:${NEXT_PORT}" >/dev/null 2>&1; then
  echo "Next.js already running on port ${NEXT_PORT}"
else
  echo "Starting Next.js on port ${NEXT_PORT}..."
  (cd frontend && \
    NEXT_PUBLIC_AUTH_MODE=test \
    NEXT_PUBLIC_API_URL=/api/v1 \
    NEXT_PUBLIC_CENTRIFUGO_URL=ws://localhost:8000/connection/websocket \
    API_PROXY_URL="http://localhost:${API_PORT}" \
    npm run dev) &
  PIDS_TO_KILL+=($!)

  for i in $(seq 1 60); do
    if curl -sf "http://localhost:${NEXT_PORT}" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  curl -sf "http://localhost:${NEXT_PORT}" >/dev/null || { echo "Next.js failed to start"; exit 1; }
  echo "Next.js ready"
fi

# --- 4. Run Playwright ---
cd frontend
NEXT_PUBLIC_AUTH_MODE=test \
NEXT_PUBLIC_API_URL=/api/v1 \
API_BASE_URL="http://localhost:${API_PORT}" \
  npx playwright test "$@"
