#!/usr/bin/env bash
set -euo pipefail

# E2E test runner.
#
# Ensures Postgres and Go API are running (reuses if already up),
# starts Next.js if needed, then runs Playwright.

API_PORT=${API_PORT:-8080}
NEXT_PORT=3000

PIDS_TO_KILL=()
cleanup() {
  for pid in "${PIDS_TO_KILL[@]}"; do
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

# --- 1. Postgres + migrations + seed ---
./scripts/ensure-test-postgres.sh

# --- 2. Go API (reuse if running) ---
API_PID=$(./scripts/ensure-test-api.sh)
if [ -n "$API_PID" ]; then
  PIDS_TO_KILL+=("$API_PID")
fi

# --- 3. Next.js (reuse if running) ---
if curl -sf "http://localhost:${NEXT_PORT}" >/dev/null 2>&1; then
  echo "Next.js already running on port ${NEXT_PORT}"
else
  echo "Starting Next.js on port ${NEXT_PORT}..."
  (cd frontend && NEXT_PUBLIC_AUTH_MODE=test NEXT_PUBLIC_API_URL=/api/v1 API_PROXY_URL="http://localhost:${API_PORT}" npm run dev) &
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
