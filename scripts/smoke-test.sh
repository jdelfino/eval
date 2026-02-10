#!/usr/bin/env bash
set -euo pipefail

# Post-deploy smoke tests for production.
# Verifies all services are responding through the ingress.
#
# Usage:
#   ./scripts/smoke-test.sh [BASE_URL]
#
# Environment:
#   SMOKE_TEST_URL      (default: https://eval.delquillan.com)
#   SMOKE_TEST_TIMEOUT  (default: 90)  — max seconds to wait per check
#   SMOKE_TEST_INTERVAL (default: 5)   — seconds between retries

BASE_URL="${1:-${SMOKE_TEST_URL:-https://eval.delquillan.com}}"
TIMEOUT="${SMOKE_TEST_TIMEOUT:-90}"
INTERVAL="${SMOKE_TEST_INTERVAL:-5}"
MAX_ATTEMPTS=$(( TIMEOUT / INTERVAL ))

FAILURES=()

# --- Helpers ---

retry_check() {
  local description="$1"
  local url="$2"
  local check_fn="$3"  # function name to call with (http_code, body_file)

  echo "Checking ${description} at ${url} ..."
  local body_file
  body_file=$(mktemp)
  trap "rm -f '$body_file'" RETURN

  for i in $(seq 1 "$MAX_ATTEMPTS"); do
    local http_code
    http_code=$(curl -s -o "$body_file" -w '%{http_code}' "$url" 2>/dev/null || echo "000")

    if $check_fn "$http_code" "$body_file"; then
      echo "  PASS: ${description}"
      return 0
    fi

    echo "  Attempt ${i}/${MAX_ATTEMPTS} (HTTP ${http_code}), retrying in ${INTERVAL}s..."
    sleep "$INTERVAL"
  done

  echo "  FAIL: ${description} (last HTTP ${http_code})"
  FAILURES+=("$description")
  return 0  # don't exit early — test all checks
}

# --- Check functions ---

check_frontend() {
  local http_code="$1" body_file="$2"
  [[ "$http_code" == "200" ]] && grep -q '_next' "$body_file" 2>/dev/null
}

check_api() {
  local http_code="$1"
  [[ "$http_code" == "401" || "$http_code" == "403" ]]
}

check_centrifugo() {
  local http_code="$1"
  # Centrifugo is reachable if we get anything other than 502/503/504/000
  [[ "$http_code" != "000" && "$http_code" != "502" && "$http_code" != "503" && "$http_code" != "504" ]]
}

# --- Run checks ---

echo "Smoke testing ${BASE_URL} (timeout ${TIMEOUT}s per check)"
echo ""

retry_check "Frontend" "${BASE_URL}/" check_frontend
retry_check "Go API" "${BASE_URL}/api/v1/auth/me" check_api
retry_check "Centrifugo" "${BASE_URL}/connection/websocket" check_centrifugo

# --- Summary ---

echo ""
echo "=============================="
TOTAL=3
PASSED=$(( TOTAL - ${#FAILURES[@]} ))
echo "Smoke tests: ${PASSED}/${TOTAL} passed"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

echo "All smoke tests passed."
