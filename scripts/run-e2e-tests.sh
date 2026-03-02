#!/usr/bin/env bash
set -euo pipefail

# E2E test runner.
#
# Infrastructure (postgres, redis, centrifugo, executor) is shared on fixed
# ports — started only if not already healthy.
#
# Go API is per-run on a random port (different branches may have different
# code). Next.js proxies to the Go API via API_PROXY_URL.
#
# Set USE_FIREBASE_EMULATOR=1 to run against the Firebase Auth Emulator
# instead of the AUTH_MODE=test bypass. This exercises the real auth flow.

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

# --- 1b. Firebase Auth Emulator (when USE_FIREBASE_EMULATOR=1) ---
if [[ "${USE_FIREBASE_EMULATOR:-}" == "1" ]]; then
  echo "Starting Firebase Auth Emulator..."
  docker compose up -d firebase-emulator --wait
fi

# --- 2. Go API on random port (builds binary if needed) ---
export API_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')

if [[ "${USE_FIREBASE_EMULATOR:-}" == "1" ]]; then
  FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 SERVER_PID=$(./scripts/ensure-test-api.sh)
else
  SERVER_PID=$(./scripts/ensure-test-api.sh)
fi
PIDS_TO_KILL+=("$SERVER_PID")

# --- 3. Next.js (production build) ---
# Always restart — the API port changes each run so the proxy target is stale.
if fuser "${NEXT_PORT}/tcp" >/dev/null 2>&1; then
  echo "Killing previous Next.js on port ${NEXT_PORT}..."
  fuser -k "${NEXT_PORT}/tcp" 2>/dev/null || true
  sleep 1
fi

echo "Building Next.js..."
if [[ "${USE_FIREBASE_EMULATOR:-}" == "1" ]]; then
  (cd frontend && \
    NEXT_PUBLIC_API_URL=/api/v1 \
    NEXT_PUBLIC_CENTRIFUGO_URL=ws://localhost:8000/connection/websocket \
    NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test \
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=http://localhost:9099 \
    API_PROXY_URL="http://localhost:${API_PORT}" \
    npm run build)
else
  (cd frontend && \
    NEXT_PUBLIC_AUTH_MODE=test \
    NEXT_PUBLIC_API_URL=/api/v1 \
    NEXT_PUBLIC_CENTRIFUGO_URL=ws://localhost:8000/connection/websocket \
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
if [[ "${USE_FIREBASE_EMULATOR:-}" == "1" ]]; then
  # In emulator mode only run the auth flow specs — the existing specs use
  # AUTH_MODE=test tokens which the Firebase validator rejects.
  # Pass explicit spec files; caller can still override with extra args.
  NEXT_PUBLIC_API_URL=/api/v1 \
  API_BASE_URL="http://localhost:${API_PORT}" \
  FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
    npx playwright test student-registration.spec.ts "$@"
else
  NEXT_PUBLIC_AUTH_MODE=test \
  NEXT_PUBLIC_API_URL=/api/v1 \
  API_BASE_URL="http://localhost:${API_PORT}" \
    npx playwright test "$@"
fi
