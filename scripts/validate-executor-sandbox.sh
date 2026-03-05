#!/usr/bin/env bash
set -euo pipefail

# Executor sandbox validation for staging CI pipeline.
# Validates that the nsjail sandbox is correctly configured: execution works,
# timeouts are enforced, network/filesystem access is blocked, and memory
# limits hold.
#
# Usage:
#   ./scripts/validate-executor-sandbox.sh [BASE_URL]
#
# Environment:
#   BASE_URL  (default: https://staging.eval.delquillan.com)  — base URL of the proxy/executor
#
# The executor is reached via:
#   BASE_URL/execute        — code execution endpoint
#   BASE_URL/healthz/executor — executor health check (proxied from /healthz)
#
# Tests included:
#   - Basic Python execution
#   - Basic Java execution
#   - Timeout enforcement
#   - Network isolation
#   - Filesystem isolation
#   - Memory limits

BASE_URL="${1:-${BASE_URL:-https://staging.eval.delquillan.com}}"
EXECUTE_URL="${BASE_URL}/execute"
HEALTH_URL="${BASE_URL}/healthz/executor"

TIMEOUT_CURL=30   # seconds for each curl call
TOTAL=0
FAILURES=()

# --- Helpers ---

result() {
  local name="$1"
  local ok="$2"       # "true" or "false"
  local detail="${3:-}"

  TOTAL=$(( TOTAL + 1 ))
  if [[ "$ok" == "true" ]]; then
    echo "  [${TOTAL}] ${name}: OK"
  else
    echo "  [${TOTAL}] ${name}: FAILED${detail:+ — ${detail}}"
    FAILURES+=("$name")
  fi
}

execute() {
  local code="$1"
  local language="${2:-python}"
  local timeout_ms="${3:-10000}"

  local body_file
  body_file=$(mktemp)
  trap "rm -f '$body_file'" RETURN

  local http_code
  http_code=$(curl -s -o "$body_file" -w '%{http_code}' \
    --max-time "${TIMEOUT_CURL}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"code\":$(printf '%s' "$code" | jq -Rs .),\"language\":\"${language}\",\"timeout_ms\":${timeout_ms}}" \
    "${EXECUTE_URL}" 2>/dev/null || echo "000")

  if [[ "$http_code" != "200" ]]; then
    echo "{\"success\":false,\"output\":\"\",\"error\":\"http_${http_code}\"}"
    rm -f "$body_file"
    return 0
  fi

  cat "$body_file"
  rm -f "$body_file"
}

get_field() {
  local json="$1"
  local field="$2"
  # Use tostring to correctly handle false (jq // empty treats false as empty)
  echo "$json" | jq -r ".${field} | tostring" 2>/dev/null || echo ""
}

# --- Health check ---

echo "Executor sandbox validation against ${BASE_URL}"
echo ""
echo "Health check..."

health_code=$(curl -s -o /dev/null -w '%{http_code}' \
  --max-time "${TIMEOUT_CURL}" \
  "${HEALTH_URL}" 2>/dev/null || echo "000")

if [[ "$health_code" != "200" ]]; then
  echo "FATAL: Executor health check failed (HTTP ${health_code}) at ${HEALTH_URL}"
  echo "  Is the staging ingress proxy deployed and the executor running?"
  exit 1
fi

echo "  Health check OK (HTTP 200)"
echo ""
echo "Running sandbox tests..."
echo ""

# --- Test 1: Basic Python execution ---

r=$(execute 'print("sandbox-ok")' python 10000)
ok=$(get_field "$r" success)
output=$(get_field "$r" output)
if [[ "$ok" == "true" && "$output" == *"sandbox-ok"* ]]; then
  result "Basic Python execution" true
else
  result "Basic Python execution" false "success=${ok} output=${output@Q}"
fi

# --- Test 2: Basic Java execution ---

JAVA_CODE='public class Main { public static void main(String[] args) { System.out.println("java-sandbox-ok"); } }'
r=$(execute "$JAVA_CODE" java 30000)
ok=$(get_field "$r" success)
output=$(get_field "$r" output)
if [[ "$ok" == "true" && "$output" == *"java-sandbox-ok"* ]]; then
  result "Basic Java execution" true
else
  result "Basic Java execution" false "success=${ok} output=${output@Q}"
fi

# --- Test 3: Timeout enforcement ---

r=$(execute 'import time; time.sleep(60)' python 1000)
ok=$(get_field "$r" success)
if [[ "$ok" == "false" ]]; then
  result "Timeout enforcement" true
else
  result "Timeout enforcement" false "expected success=false but got success=${ok}"
fi

# --- Test 4: Network isolation ---

r=$(execute 'import socket; s=socket.socket(); s.connect(("8.8.8.8",53)); print("CONNECTED")' python 10000)
ok=$(get_field "$r" success)
output=$(get_field "$r" output)
# Sandbox should either fail the connection or not output CONNECTED
network_blocked="false"
if [[ "$ok" == "false" ]]; then
  network_blocked="true"
elif [[ "$output" != *"CONNECTED"* ]]; then
  network_blocked="true"
fi
if [[ "$network_blocked" == "true" ]]; then
  result "Network isolation" true
else
  result "Network isolation" false "sandbox allowed outbound connection: success=${ok} output=${output@Q}"
fi

# --- Test 5: Filesystem isolation ---

r=$(execute 'print(open("/etc/passwd").read())' python 10000)
ok=$(get_field "$r" success)
if [[ "$ok" == "false" ]]; then
  result "Filesystem isolation" true
else
  result "Filesystem isolation" false "expected success=false but sandbox allowed /etc/passwd read"
fi

# --- Test 6: Memory limits ---

r=$(execute 'x = "A" * (512 * 1024 * 1024); print("allocated")' python 10000)
ok=$(get_field "$r" success)
output=$(get_field "$r" output)
mem_limited="false"
if [[ "$ok" == "false" ]]; then
  mem_limited="true"
elif [[ "$output" != *"allocated"* ]]; then
  mem_limited="true"
fi
if [[ "$mem_limited" == "true" ]]; then
  result "Memory limits" true
else
  result "Memory limits" false "sandbox allowed 512MB allocation: success=${ok} output=${output@Q}"
fi

# --- Summary ---

echo ""
echo "=============================="
PASSED=$(( TOTAL - ${#FAILURES[@]} ))
echo "Executor sandbox validation: ${PASSED} passed, ${#FAILURES[@]} failed (${TOTAL} total)"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

echo "All executor sandbox checks passed."
