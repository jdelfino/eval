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

if ! curl -sf --max-time 3 http://localhost:8081/healthz >/dev/null 2>&1; then
  echo "Starting executor..."
  docker compose up -d executor --build --wait
fi

# --- 2. Go API on random port (builds binary if needed) ---
export API_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')
SERVER_PID=$(./scripts/ensure-test-api.sh)
PIDS_TO_KILL+=("$SERVER_PID")

# --- 3. Next.js (production build) ---
# Always restart — the API port changes each run so the proxy target is stale.
if fuser "${NEXT_PORT}/tcp" >/dev/null 2>&1; then
  echo "Killing previous Next.js on port ${NEXT_PORT}..."
  fuser -k "${NEXT_PORT}/tcp" 2>/dev/null || true
  sleep 1
fi

echo "Building Next.js..."
(cd frontend && \
  NEXT_PUBLIC_AUTH_MODE=test \
  NEXT_PUBLIC_API_URL=/api/v1 \
  NEXT_PUBLIC_CENTRIFUGO_URL=ws://localhost:8000/connection/websocket \
  API_PROXY_URL="http://localhost:${API_PORT}" \
  npm run build)

echo "Starting Next.js on port ${NEXT_PORT}..."
# Copy static assets into the standalone output (required for standalone mode)
cp -r frontend/.next/static frontend/.next/standalone/.next/static
cp -r frontend/public frontend/.next/standalone/public 2>/dev/null || true
(cd frontend && \
  HOSTNAME=0.0.0.0 \
  PORT="${NEXT_PORT}" \
  node .next/standalone/server.js) &
PIDS_TO_KILL+=($!)

for i in $(seq 1 30); do
  if curl -sf --max-time 5 "http://localhost:${NEXT_PORT}" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf --max-time 5 "http://localhost:${NEXT_PORT}" >/dev/null || { echo "Next.js failed to start"; exit 1; }
echo "Next.js ready"

# --- 4. Run Playwright ---
cd frontend
NEXT_PUBLIC_AUTH_MODE=test \
NEXT_PUBLIC_API_URL=/api/v1 \
API_BASE_URL="http://localhost:${API_PORT}" \
  npx playwright test "$@"
