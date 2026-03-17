#!/usr/bin/env bash
set -euo pipefail

# E2E test runner.
#
# Infrastructure (postgres, redis, centrifugo, executor) is shared on fixed
# ports — started only if not already healthy.
#
# Go API runs on a fixed default port (4100) — can be overridden via API_PORT.
# Using a fixed port makes Next.js builds deterministic (API_PROXY_URL is baked
# in at build time), enabling cache hits across CI runs.
#
# Always uses the Firebase Auth Emulator for real end-to-end auth testing.
#
# When running inside a GitHub Actions container job, set DOCKER_HOST_IP to
# the Docker host gateway so scripts can reach compose services on the host.

NEXT_PORT=3000

# Docker compose services run on the host. In container jobs, localhost
# doesn't reach the host — use DOCKER_HOST_IP (set by CI) instead.
HOST=${DOCKER_HOST_IP:-localhost}

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

if ! curl -sf --max-time 3 "http://${HOST}:8081/healthz" >/dev/null 2>&1; then
  echo "Starting executor..."
  docker compose up -d executor --build --wait
fi

# --- 1b. Firebase Auth Emulator (always required) ---
if ! curl -sf --max-time 3 "http://${HOST}:9099/" >/dev/null 2>&1; then
  echo "Starting Firebase Auth Emulator..."
  docker compose up -d firebase-emulator --wait
fi

# --- 2. Go API on fixed port (builds binary if needed) ---
export API_PORT=${API_PORT:-4100}

export FIREBASE_AUTH_EMULATOR_HOST=${HOST}:9099
SERVER_PID=$(./scripts/ensure-test-api.sh)
PIDS_TO_KILL+=("$SERVER_PID")

# --- 3. Next.js (production build) ---
# Stop any running Next.js on the port before (re)starting.
if fuser "${NEXT_PORT}/tcp" >/dev/null 2>&1; then
  echo "Killing previous Next.js on port ${NEXT_PORT}..."
  fuser -k "${NEXT_PORT}/tcp" 2>/dev/null || true
  sleep 1
fi

# Turbopack (Next.js 16 default) cannot follow symlinks outside the project root.
# In worktrees, node_modules is symlinked to the main repo to save install time.
# Replace with a real install so the production build works.
if [ -L frontend/node_modules ]; then
  echo "Symlinked node_modules detected — running npm install for Turbopack compatibility..."
  rm frontend/node_modules
  (cd frontend && npm install --prefer-offline)
fi

if [ -d frontend/.next/standalone ]; then
  echo "Next.js standalone build exists, skipping build"
else
  echo "Building Next.js..."
  (cd frontend && \
    NEXT_PUBLIC_API_URL=/api/v1 \
    NEXT_PUBLIC_CENTRIFUGO_URL="ws://${HOST}:8000/connection/websocket" \
    NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${HOST}" \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test \
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST="http://${HOST}:9099" \
    API_PROXY_URL="http://localhost:${API_PORT}" \
    npm run build)
fi

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
NEXT_PUBLIC_API_URL=/api/v1 \
API_BASE_URL="http://localhost:${API_PORT}" \
FIREBASE_AUTH_EMULATOR_HOST="${HOST}:9099" \
BOOTSTRAP_ADMIN_EMAIL=emulator-admin@test.local \
  npx playwright test "$@"
